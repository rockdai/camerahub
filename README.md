# RTSP 视频流录制工具

这是一个基于 Node.js 和 ffmpeg 的 RTSP 视频流录制工具，可以同时录制多路 RTSP 视频流。

## 功能特点

- 支持多路 RTSP 视频流同时录制
- 自动分段保存视频文件
- 自动重试连接，提高稳定性
- 支持 Docker 部署

## 使用 Docker 运行

### 构建镜像

```bash
docker build -t rtsp .
```

### 运行容器

```bash
docker run -d \
  --name rtsp \
  -v /path/to/your/videos:/output \
  --restart unless-stopped \
  rtsp
```

将 `/path/to/your/videos` 替换为宿主机上用于存储视频文件的目录路径。

### 查看日志

```bash
docker logs -f rtsp
```

### 停止容器

```bash
docker stop rtsp
```

## 配置

在 `index.js` 文件中，可以修改以下配置：

- `CONFIG`: RTSP 视频流地址配置
- `SEGMENT_DURATION`: 视频分段时长（秒）
- `MAX_RETRIES`: 最大重试次数
- `RETRY_INTERVAL`: 重试间隔（毫秒）

## 输出文件

录制的视频文件将保存在 `/output` 目录中（Docker 容器内），文件名格式为：
`摄像头ID_年-月-日-时-分.mp4`

例如：`cam1_2024-03-20-14-30.mp4`