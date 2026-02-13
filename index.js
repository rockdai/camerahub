'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

function resolveConfigFilePath(configFilePath) {
  return configFilePath || process.env.CONFIG_FILE || '/app/config.json';
}

function resolveOutputDir(outputDir) {
  return outputDir || process.env.OUTPUT_DIR || './output';
}

// 从配置文件或环境变量解析摄像头配置
function parseCameraConfig(options = {}) {
  const configFilePath = resolveConfigFilePath(options.configFilePath);

  // 1. 首先尝试从配置文件读取
  if (fs.existsSync(configFilePath)) {
    try {
      console.log(`正在从配置文件 ${configFilePath} 读取配置...`);
      const configData = fs.readFileSync(configFilePath, 'utf8');
      const config = JSON.parse(configData);

      // 配置文件可以包含摄像头配置和其他参数
      if (config.CAMERA_CONFIG && Array.isArray(config.CAMERA_CONFIG) && config.CAMERA_CONFIG.length > 0) {
        console.log(`从配置文件成功读取 ${config.CAMERA_CONFIG.length} 个摄像头配置`);
        return config.CAMERA_CONFIG;
      }
    } catch (err) {
      console.error(`读取配置文件失败: ${err.message}`);
    }
  }

  // 2. 尝试从环境变量 CAMERA_CONFIG 解析 JSON 配置
  if (process.env.CAMERA_CONFIG) {
    try {
      const cameraConfigs = JSON.parse(process.env.CAMERA_CONFIG);
      if (Array.isArray(cameraConfigs) && cameraConfigs.length > 0) {
        console.log(`从 CAMERA_CONFIG 环境变量成功读取 ${cameraConfigs.length} 个摄像头配置`);
        return cameraConfigs;
      }
    } catch (err) {
      console.error('解析 CAMERA_CONFIG 环境变量失败:', err.message);
    }
  }

  // 3. 尝试从环境变量 CAMERA_ID_n 和 CAMERA_URL_n 解析配置
  const cameraConfigs = [];
  for (let i = 1; i <= 100; i++) {
    const id = process.env[`CAMERA_ID_${i}`];
    const url = process.env[`CAMERA_URL_${i}`];
    if (id && url) {
      cameraConfigs.push({ id, url });
    } else if (id || url) {
      console.warn(`摄像头 ${i} 配置不完整，已忽略`);
    } else {
      // 没有更多配置，退出循环
      break;
    }
  }

  if (cameraConfigs.length > 0) {
    console.log(`从环境变量成功读取 ${cameraConfigs.length} 个摄像头配置`);
    return cameraConfigs;
  }

  const helpText = [
    '错误: 未找到任何摄像头配置',
    '请通过以下方式之一提供摄像头配置:',
    '1. 提供配置文件 config.json 中的 CAMERA_CONFIG 字段',
    '2. 设置环境变量 CAMERA_CONFIG',
    '3. 设置环境变量 CAMERA_ID_1, CAMERA_URL_1 等'
  ].join('\n');

  throw new Error(helpText);
}

// 从配置文件或环境变量获取其他配置参数
function getConfig(key, defaultValue, options = {}) {
  const configFilePath = resolveConfigFilePath(options.configFilePath);

  // 1. 首先尝试从配置文件读取
  if (fs.existsSync(configFilePath)) {
    try {
      const configData = fs.readFileSync(configFilePath, 'utf8');
      const config = JSON.parse(configData);
      if (config[key] !== undefined) {
        return config[key];
      }
    } catch (err) {
      // 配置文件读取失败，忽略错误，继续尝试其他方式
    }
  }

  // 2. 尝试从环境变量读取
  if (process.env[key] !== undefined) {
    return process.env[key];
  }

  // 3. 返回默认值
  return defaultValue;
}

class CameraProcessor {
  constructor(config, options = {}) {
    this.config = config;
    this.options = options;

    this.ffmpegProcess = null;
    this.retries = 0;
    this.isRunning = false;
    this.lastDataTime = 0;
    this.errorCheckTimer = null;
    this.lastError = '';

    this.outputDir = resolveOutputDir(options.outputDir);
    this.maxRetries = Number.parseInt(options.maxRetries ?? getConfig('MAX_RETRIES', '5', options), 10);
    this.retryIntervalMs = Number.parseInt(options.retryIntervalMs ?? getConfig('RETRY_INTERVAL', '5000', options), 10);
    this.segmentDurationSec = Number.parseInt(options.segmentDurationSec ?? getConfig('SEGMENT_DURATION', '600', options), 10);
    this.errorCheckIntervalMs = Number.parseInt(options.errorCheckIntervalMs ?? getConfig('ERROR_CHECK_INTERVAL', '30000', options), 10);
    this.stallTimeoutMs = Number.parseInt(options.stallTimeoutMs ?? getConfig('STALL_TIMEOUT', '60000', options), 10);
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.startFFmpegProcess();
  }

  startFFmpegProcess() {
    if (this.ffmpegProcess) {
      this.stopProcess();
    }

    // 确保输出目录存在
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    console.log(`[${this.config.id}] 启动 ffmpeg 进程...`);

    const args = [
      '-rtsp_transport', 'tcp',            // 使用TCP传输RTSP流
      '-i', this.config.url,               // 输入RTSP地址
      '-an',                               // 禁用音频
      '-c:v', 'copy',                      // 视频流直接复制，不重新编码
      '-f', 'segment',                     // 使用分段录制
      '-segment_time', this.segmentDurationSec, // 分段时长
      '-reset_timestamps', '1',            // 重置时间戳
      '-strftime', '1',                    // 启用时间戳格式化
      path.join(this.outputDir, `${this.config.id}_%Y-%m-%d-%H-%M.mp4`) // 输出文件名格式
    ];

    this.ffmpegProcess = spawn('ffmpeg', args);
    this.lastDataTime = Date.now();
    this.startErrorCheck();

    this.ffmpegProcess.stderr.on('data', (data) => {
      const message = data.toString();
      this.lastDataTime = Date.now();

      // 只记录错误信息
      if (message.toLowerCase().includes('error') || message.includes('failed') || message.includes('无法')) {
        this.lastError = message;
        console.error(`[${this.config.id}] ffmpeg 错误: ${message}`);
      }
    });

    this.ffmpegProcess.stdout.on('data', () => {
      this.lastDataTime = Date.now();
    });

    this.ffmpegProcess.on('exit', (code, signal) => {
      console.log(`[${this.config.id}] ffmpeg 进程退出，退出码: ${code}, 信号: ${signal}`);
      this.stopErrorCheck();
      this.ffmpegProcess = null;

      if (code === 0) {
        console.log(`[${this.config.id}] ffmpeg 正常退出`);
        this.retries = 0;
        if (this.isRunning) {
          this.startFFmpegProcess(); // 正常退出后重新启动
        }
      } else {
        console.error(`[${this.config.id}] ffmpeg 进程异常退出`);
        this.retryProcess();
      }
    });

    this.ffmpegProcess.on('error', (err) => {
      console.error(`[${this.config.id}] ffmpeg 进程错误: ${err.message}`);
      this.retryProcess();
    });
  }

  startErrorCheck() {
    this.stopErrorCheck(); // 确保之前的定时器被清除

    this.errorCheckTimer = setInterval(() => {
      const now = Date.now();
      const timeSinceLastData = now - this.lastDataTime;

      // 检查是否超过停滞超时时间
      if (timeSinceLastData > this.stallTimeoutMs) {
        console.error(`[${this.config.id}] 视频流停滞 ${timeSinceLastData/1000}秒，准备重启进程`);
        this.retryProcess();
      }
    }, this.errorCheckIntervalMs);
  }

  stopErrorCheck() {
    if (this.errorCheckTimer) {
      clearInterval(this.errorCheckTimer);
      this.errorCheckTimer = null;
    }
  }

  retryProcess() {
    if (!this.isRunning) return;

    if (this.retries >= this.maxRetries) {
      console.error(`[${this.config.id}] 达到最大重试次数 (${this.maxRetries})，等待60秒后重新尝试`);
      this.retries = 0;
      setTimeout(() => this.startFFmpegProcess(), 60000);
      return;
    }

    this.retries++;
    const delay = Math.min(this.retryIntervalMs * Math.pow(2, this.retries - 1), 30000); // 指数退避，最大30秒
    console.log(`[${this.config.id}] 将在 ${delay/1000}秒后尝试重启进程（第 ${this.retries} 次重试）...`);

    this.stopProcess();
    setTimeout(() => this.startFFmpegProcess(), delay);
  }

  stopProcess() {
    if (this.ffmpegProcess) {
      this.ffmpegProcess.kill('SIGKILL');
      this.ffmpegProcess = null;
    }
    this.stopErrorCheck();
  }

  stop() {
    this.isRunning = false;
    this.stopProcess();
  }
}

class CameraManager {
  constructor(configs, options = {}) {
    this.configs = configs;
    this.options = options;
    this.processors = new Map();
  }

  start() {
    for (const config of this.configs) {
      const processor = new CameraProcessor(config, this.options);
      this.processors.set(config.id, processor);
      processor.start();
    }
  }

  stop() {
    for (const processor of this.processors.values()) {
      processor.stop();
    }
    this.processors.clear();
  }
}

function main() {
  const options = {
    configFilePath: resolveConfigFilePath(),
    outputDir: resolveOutputDir()
  };

  let configs;
  try {
    configs = parseCameraConfig(options);
  } catch (err) {
    console.error(String(err && err.message ? err.message : err));
    process.exit(1);
  }

  const manager = new CameraManager(configs, options);

  // 打印当前配置（仅在运行主程序时）
  console.log('当前配置:');
  console.log(`- 输出目录: ${options.outputDir}`);
  console.log(`- 视频分段时长: ${getConfig('SEGMENT_DURATION', '600', options)}秒`);
  console.log(`- 最大重试次数: ${getConfig('MAX_RETRIES', '5', options)}`);
  console.log(`- 重试间隔: ${getConfig('RETRY_INTERVAL', '5000', options)}毫秒`);
  console.log(`- 错误检查间隔: ${getConfig('ERROR_CHECK_INTERVAL', '30000', options)}毫秒`);
  console.log(`- 视频流停滞超时: ${getConfig('STALL_TIMEOUT', '60000', options)}毫秒`);
  console.log('- RTSP 配置:');
  configs.forEach(config => {
    console.log(`  - ${config.id}: ${config.url}`);
  });

  manager.start();

  // 程序退出时，确保所有ffmpeg子进程也退出
  process.on('exit', () => {
    manager.stop();
  });

  process.on('SIGINT', () => process.exit());   // 捕获Ctrl+C
  process.on('SIGTERM', () => process.exit());  // 捕获kill命令
}

module.exports = {
  parseCameraConfig,
  getConfig,
  CameraProcessor,
  CameraManager,
  main
};

if (require.main === module) {
  main();
}
