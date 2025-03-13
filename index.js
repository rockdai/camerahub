'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// 输出文件目录
const OUTPUT_DIR = process.env.OUTPUT_DIR || './output';
const CONFIG_FILE = process.env.CONFIG_FILE || '/app/config.json';

// 从配置文件或环境变量解析 RTSP 配置
function parseRtspConfig() {
  // 1. 首先尝试从配置文件读取
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      console.log(`正在从配置文件 ${CONFIG_FILE} 读取配置...`);
      const configData = fs.readFileSync(CONFIG_FILE, 'utf8');
      const config = JSON.parse(configData);

      // 配置文件可以包含摄像头配置和其他参数
      if (config.CAMERAS && Array.isArray(config.CAMERAS) && config.CAMERAS.length > 0) {
        console.log(`从配置文件成功读取 ${config.CAMERAS.length} 个摄像头配置`);
        return config.CAMERAS;
      }
    } catch (err) {
      console.error(`读取配置文件失败: ${err.message}`);
    }
  }

  // 2. 尝试从环境变量 RTSP_CONFIG 解析 JSON 配置
  if (process.env.RTSP_CONFIG) {
    try {
      const cameraConfigs = JSON.parse(process.env.RTSP_CONFIG);
      if (Array.isArray(cameraConfigs) && cameraConfigs.length > 0) {
        console.log(`从 RTSP_CONFIG 环境变量成功读取 ${cameraConfigs.length} 个摄像头配置`);
        return cameraConfigs;
      }
    } catch (err) {
      console.error('解析 RTSP_CONFIG 环境变量失败:', err.message);
    }
  }

  // 3. 尝试从单独的环境变量解析配置
  const configs = [];
  let i = 1;

  while (true) {
    const id = process.env[`RTSP_ID_${i}`];
    const url = process.env[`RTSP_URL_${i}`];

    if (!id || !url) break;

    configs.push({ id, url });
    i++;
  }

  if (configs.length > 0) {
    console.log(`从环境变量成功读取 ${configs.length} 个摄像头配置`);
    return configs;
  }

  // 4. 未找到有效配置，报错退出
  console.error('错误: 未找到有效的摄像头配置');
  console.error('请通过以下方式之一提供配置:');
  console.error('1. 创建配置文件 ' + CONFIG_FILE);
  console.error('2. 设置环境变量 RTSP_CONFIG');
  console.error('3. 设置环境变量 RTSP_ID_1, RTSP_URL_1 等');
  process.exit(1);
}

// 从配置文件或环境变量获取其他配置参数
function getConfig(key, defaultValue) {
  // 1. 首先尝试从配置文件读取
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const configData = fs.readFileSync(CONFIG_FILE, 'utf8');
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

// RTSP 流地址配置
const CONFIG = parseRtspConfig();

// 从配置文件或环境变量获取其他配置参数
const MAX_RETRIES = parseInt(getConfig('MAX_RETRIES', '5'), 10);
const RETRY_INTERVAL = parseInt(getConfig('RETRY_INTERVAL', '5000'), 10);
const SEGMENT_DURATION = parseInt(getConfig('SEGMENT_DURATION', '600'), 10);
const ERROR_CHECK_INTERVAL = parseInt(getConfig('ERROR_CHECK_INTERVAL', '30000'), 10);
const STALL_TIMEOUT = parseInt(getConfig('STALL_TIMEOUT', '60000'), 10);

// 打印当前配置
console.log('当前配置:');
console.log(`- 输出目录: ${OUTPUT_DIR}`);
console.log(`- 视频分段时长: ${SEGMENT_DURATION}秒`);
console.log(`- 最大重试次数: ${MAX_RETRIES}`);
console.log(`- 重试间隔: ${RETRY_INTERVAL}毫秒`);
console.log(`- 错误检查间隔: ${ERROR_CHECK_INTERVAL}毫秒`);
console.log(`- 视频流停滞超时: ${STALL_TIMEOUT}毫秒`);
console.log('- RTSP 配置:');
CONFIG.forEach(config => {
  console.log(`  - ${config.id}: ${config.url}`);
});

// 确保输出目录存在
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

class RTSPProcessor {
  constructor(config) {
    this.config = config;
    this.ffmpegProcess = null;
    this.retries = 0;
    this.isRunning = false;
    this.lastDataTime = 0;
    this.errorCheckTimer = null;
    this.lastError = '';
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

    console.log(`[${this.config.id}] 启动 ffmpeg 进程...`);

    const args = [
      '-rtsp_transport', 'tcp',           // 使用TCP传输RTSP流
      '-i', this.config.url,              // 输入RTSP地址
      '-an',                              // 禁用音频
      '-c:v', 'copy',                     // 视频流直接复制，不重新编码
      '-f', 'segment',                    // 使用分段录制
      '-segment_time', SEGMENT_DURATION,   // 分段时长
      '-reset_timestamps', '1',           // 重置时间戳
      '-strftime', '1',                   // 启用时间戳格式化
      path.join(OUTPUT_DIR, `${this.config.id}_%Y-%m-%d-%H-%M.mp4`)  // 输出文件名格式
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
      if (timeSinceLastData > STALL_TIMEOUT) {
        console.error(`[${this.config.id}] 视频流停滞 ${timeSinceLastData/1000}秒，准备重启进程`);
        this.retryProcess();
      }
    }, ERROR_CHECK_INTERVAL);
  }

  stopErrorCheck() {
    if (this.errorCheckTimer) {
      clearInterval(this.errorCheckTimer);
      this.errorCheckTimer = null;
    }
  }

  retryProcess() {
    if (!this.isRunning) return;

    if (this.retries >= MAX_RETRIES) {
      console.error(`[${this.config.id}] 达到最大重试次数 (${MAX_RETRIES})，等待60秒后重新尝试`);
      this.retries = 0;
      setTimeout(() => this.startFFmpegProcess(), 60000);
      return;
    }

    this.retries++;
    const delay = Math.min(RETRY_INTERVAL * Math.pow(2, this.retries - 1), 30000); // 指数退避，最大30秒
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

// 管理所有摄像头进程
class RTSPManager {
  constructor() {
    this.processors = new Map();
  }

  start() {
    for (const config of CONFIG) {
      const processor = new RTSPProcessor(config);
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

// 创建并启动管理器
const manager = new RTSPManager();
manager.start();

// 程序退出时，确保所有ffmpeg子进程也退出
process.on('exit', () => {
  manager.stop();
});

process.on('SIGINT', () => process.exit());   // 捕获Ctrl+C
process.on('SIGTERM', () => process.exit());  // 捕获kill命令
