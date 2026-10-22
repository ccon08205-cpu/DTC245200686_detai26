# ==============================================================================
# Multi-stage Dockerfile cho Backend (Node.js + Express + TypeScript)
# Đề 26: Hệ thống Quản lý Sự kiện
# Tuân thủ chuẩn Docker An ninh: Non-root user, Minimal attack surface
# ==============================================================================

# STAGE 1: Builder
FROM node:20-alpine AS builder

WORKDIR /build

# Copy dependency manifests
COPY package*.json tsconfig.json ./

# Cài đặt tất cả dependencies (bao gồm devDependencies cho TypeScript compiler)
RUN npm install

# Copy toàn bộ mã nguồn
COPY src/ ./src/

# Biên dịch TypeScript sang JavaScript trong thư mục dist/
RUN npm run build

# ==============================================================================
# STAGE 2: Production Runner
FROM node:20-alpine AS runner

WORKDIR /app

# Cài đặt wget và dumb-init để quản lý tiến trình PID 1 an toàn
RUN apk add --no-cache dumb-init

ENV NODE_ENV=production
ENV PORT=3000

# Copy package manifests và chỉ cài đặt production dependencies
COPY package*.json ./
RUN npm install --only=production && npm cache clean --force

# Copy code đã biên dịch từ Stage 1
COPY --from=builder /build/dist ./dist

# Đảm bảo quyền sở hữu thuộc về user non-root 'node' (UID 1000 mặc định trên Alpine)
RUN chown -R node:node /app

# CHUYỂN SANG USER NON-ROOT
USER node

EXPOSE 3000

# Health check định kỳ
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/index.js"]
