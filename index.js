'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// 输出文件目录
const OUTPUT_DIR = process.env.OUTPUT_DIR || './output';
// RTSP 流地址配置
const CONFIG = [{
  id: 'cam1',
  url: 'rtsp://admin:123456@47.98.54.212:8881/h265/2',
}, {
  id: 'cam2',
  url: 'rtsp://admin:123456@47.98.54.212:8882/h265/2',
}];

const MAX_RETRIES = 5;                         // 最大重试次数
const RETRY_INTERVAL = 5000;                   // 重试间隔（毫秒）
const SEGMENT_DURATION = 600;                  // 视频片段时长（秒），改为10分钟
const ERROR_CHECK_INTERVAL = 30000;            // 错误检查间隔（毫秒）
const STALL_TIMEOUT = 60000;                   // 视频流停滞超时时间（毫秒）

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
