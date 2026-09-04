# ---- 阶段一：依赖安装+编译（含编译工具链） ----
FROM node:22-slim AS builder
WORKDIR /app
# 安装编译原生模块所需的工具（better-sqlite3 需要 Python + g++）
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci

# ---- 阶段二：运行时（纯运行，不编译） ----
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
# 关键：从 builder 阶段复制已编译好的 node_modules，不再重新安装
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
COPY server ./server
COPY src/logic.js src/utils.js src/mock-data.js ./src/
EXPOSE 3000
CMD ["node", "server/index.js"]
