# 使用官方 Bun 镜像
FROM oven/bun:alpine AS base
WORKDIR /usr/src/app

# 安装依赖到临时目录，用于缓存
FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json bun.lock /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile

# 仅安装生产环境依赖
RUN mkdir -p /temp/prod
COPY package.json bun.lock /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

# 复制依赖和源代码
FROM base AS release
COPY --from=install /temp/prod/node_modules node_modules
COPY src/ ./src/
COPY package.json ./

# 设置环境变量、暴露端口并启动应用
ENV NODE_ENV=production
USER bun
EXPOSE 3000/tcp
ENTRYPOINT [ "bun", "./src/index.ts" ]