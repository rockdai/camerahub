# RTSP 视频流录制工具

基于 ffmpeg 的 RTSP 视频流录制工具，支持同时录制多路 RTSP 视频流。

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

**注意：** 必须提供摄像头配置，否则程序将报错退出。

### 使用配置文件（推荐）

创建配置文件 `config.json`：

```json
{
  "cameras": [
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
  --name rtsp \
  -v /path/to/your/videos:/output \
  -v /path/to/your/config.json:/app/config.json \
  --restart unless-stopped \
  rtsp
```

### 使用环境变量配置

如果不想使用配置文件，也可以通过环境变量配置：

```bash
docker run -d \
  --name rtsp \
  -v /path/to/your/videos:/output \
  -e RTSP_ID_1=cam1 \
  -e RTSP_URL_1=rtsp://user:password@camera-ip:554/stream \
  -e RTSP_ID_2=cam2 \
  -e RTSP_URL_2=rtsp://user:password@camera-ip:554/stream \
  -e SEGMENT_DURATION=600 \
  -e MAX_RETRIES=5 \
  --restart unless-stopped \
  rtsp
```

或者使用 JSON 格式配置多个摄像头：

```bash
docker run -d \
  --name rtsp \
  -v /path/to/your/videos:/output \
  -e RTSP_CONFIG='[{"id":"cam1","url":"rtsp://user:password@camera-ip:554/stream"},{"id":"cam2","url":"rtsp://user:password@camera-ip:554/stream"}]' \
  --restart unless-stopped \
  rtsp
```

### 查看日志

```bash
docker logs -f rtsp
```

### 停止容器

```bash
docker stop rtsp
```

## 配置选项

### 配置文件格式

配置文件使用 JSON 格式，示例如下：

```json
{
  "cameras": [
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

### 配置参数

| 参数 | 说明 | 默认值 |
|---------|------|-------|
| cameras | 摄像头配置数组（必需） | - |
| SEGMENT_DURATION | 视频分段时长（秒） | 600 |
| MAX_RETRIES | 最大重试次数 | 5 |
| RETRY_INTERVAL | 重试间隔（毫秒） | 5000 |
| ERROR_CHECK_INTERVAL | 错误检查间隔（毫秒） | 30000 |
| STALL_TIMEOUT | 视频流停滞超时时间（毫秒） | 60000 |

### 环境变量

| 环境变量 | 说明 | 默认值 |
|---------|------|-------|
| CONFIG_FILE | 配置文件路径 | /app/config.json |
| OUTPUT_DIR | 输出目录路径 | /output |
| RTSP_CONFIG | JSON 格式的 RTSP 配置数组 | - |
| RTSP_ID_n | 第 n 个摄像头的 ID | - |
| RTSP_URL_n | 第 n 个摄像头的 URL | - |
| SEGMENT_DURATION | 视频分段时长（秒） | 600 |
| MAX_RETRIES | 最大重试次数 | 5 |
| RETRY_INTERVAL | 重试间隔（毫秒） | 5000 |
| ERROR_CHECK_INTERVAL | 错误检查间隔（毫秒） | 30000 |
| STALL_TIMEOUT | 视频流停滞超时时间（毫秒） | 60000 |

## 输出文件

录制的视频文件将保存在 `/output` 目录中（Docker 容器内），文件名格式为：
`摄像头ID_年-月-日-时-分.mp4`

例如：`cam1_2024-03-20-14-30.mp4`