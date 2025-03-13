# CameraHub 视频流录制工具

基于 ffmpeg 的 RTSP 视频流录制工具，支持同时录制多路 RTSP 视频流。

## 功能特点

- 支持多路 RTSP 视频流同时录制
- 自动分段保存视频文件，出错自动重试连接
- 支持 Docker 部署

## 使用 Docker 运行

### 拉取镜像

```bash
docker pull rockdai/camerahub:latest
```

### 运行容器

**注意：** 必须提供摄像头配置，否则程序将报错退出。

### 使用配置文件（推荐）

创建配置文件 `config.json`：

```json
{
  "CAMERA_CONFIG": [
    {
      "id": "cam1",
      "url": "rtsp://user:password@camera-ip:554/stream"
    },
    {
      "id": "cam2",
      "url": "rtsp://user:password@camera-ip:554/stream"
    }
  ],
  "SEGMENT_DURATION": 600,
  "MAX_RETRIES": 5,
  "RETRY_INTERVAL": 5000
}
```

运行容器并挂载配置文件：

```bash
docker run -d \
  --name camerahub \
  -v /path/to/your/videos:/output \
  -v /path/to/your/config.json:/app/config.json \
  --restart unless-stopped \
  rockdai/camerahub:latest
```

### 使用环境变量配置

如果不想使用配置文件，也可以通过环境变量配置：

```bash
docker run -d \
  --name camerahub \
  -v /path/to/your/videos:/output \
  -e CAMERA_ID_1=cam1 \
  -e CAMERA_URL_1=rtsp://user:password@camera-ip:554/stream \
  -e CAMERA_ID_2=cam2 \
  -e CAMERA_URL_2=rtsp://user:password@camera-ip:554/stream \
  -e SEGMENT_DURATION=600 \
  -e MAX_RETRIES=5 \
  --restart unless-stopped \
  rockdai/camerahub:latest
```

### 使用 JSON 格式环境变量配置

如果摄像头较多，可以使用 JSON 格式的环境变量：

```bash
docker run -d \
  --name camerahub \
  -v /path/to/your/videos:/output \
  -e CAMERA_CONFIG='[{"id":"cam1","url":"rtsp://user:password@camera-ip:554/stream"},{"id":"cam2","url":"rtsp://user:password@camera-ip:554/stream"}]' \
  --restart unless-stopped \
  rockdai/camerahub:latest
```

## 配置选项

所有配置选项既可以通过配置文件设置，也可以通过环境变量设置。环境变量的优先级高于配置文件。

### 配置文件示例

配置文件使用 JSON 格式，示例如下：

```json
{
  "CAMERA_CONFIG": [
    {
      "id": "cam1",
      "url": "rtsp://user:password@camera-ip:554/stream"
    },
    {
      "id": "cam2",
      "url": "rtsp://user:password@camera-ip:554/stream"
    }
  ],
  "SEGMENT_DURATION": 600,
  "MAX_RETRIES": 5,
  "RETRY_INTERVAL": 5000,
  "ERROR_CHECK_INTERVAL": 30000,
  "STALL_TIMEOUT": 60000
}
```

### 可用配置选项

| 配置选项 | 环境变量 | 说明 | 默认值 |
|---------|---------|------|-------|
| CAMERA_CONFIG | CAMERA_CONFIG | 摄像头配置数组（必需），可以通过 JSON 字符串设置 | - |
| - | CAMERA_ID_n, CAMERA_URL_n | 单个摄像头配置，n 为序号（1, 2, 3...） | - |
| SEGMENT_DURATION | SEGMENT_DURATION | 视频分段时长（秒） | 600 |
| MAX_RETRIES | MAX_RETRIES | 最大重试次数 | 5 |
| RETRY_INTERVAL | RETRY_INTERVAL | 重试间隔（毫秒） | 5000 |
| ERROR_CHECK_INTERVAL | ERROR_CHECK_INTERVAL | 错误检查间隔（毫秒） | 30000 |
| STALL_TIMEOUT | STALL_TIMEOUT | 视频流停滞超时时间（毫秒） | 60000 |
| - | CONFIG_FILE | 配置文件路径 | /app/config.json |
| - | OUTPUT_DIR | 输出目录路径 | /output |

## 输出文件

录制的视频文件将保存在 `OUTPUT_DIR` 目录中，文件名格式为：
`摄像头ID_年-月-日-时-分.mp4`

例如：`cam1_2024-03-17-19-30.mp4`