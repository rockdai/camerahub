# 使用 Node.js 官方镜像作为基础镜像
FROM node:18-slim

# 设置时区为北京时间
ENV TZ=Asia/Shanghai
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# 设置工作目录
WORKDIR /app

# 安装 ffmpeg
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# 复制 package.json 和 package-lock.json（如果存在）
COPY package*.json ./

# 安装依赖
RUN npm install --production

# 复制源代码和配置文件
COPY . .

# 设置环境变量
ENV NODE_ENV=production
ENV OUTPUT_DIR=/output
ENV CONFIG_FILE=/app/config.json
ENV SEGMENT_DURATION=600
ENV MAX_RETRIES=5
ENV RETRY_INTERVAL=5000
ENV ERROR_CHECK_INTERVAL=30000
ENV STALL_TIMEOUT=60000

# 创建输出目录
RUN mkdir -p /output && \
    chown -R node:node /output

# 声明配置文件和输出目录为卷，可以被挂载
VOLUME ["/output", "/app/config.json"]

# 使用非 root 用户运行
USER node

# 启动应用
CMD ["node", "index.js"]