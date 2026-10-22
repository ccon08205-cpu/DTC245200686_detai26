# ==============================================================================
# Multi-stage Dockerfile cho Frontend React (Vite)
# Đề 26: Hệ thống Quản lý Sự kiện
# Triển khai tĩnh trên Nginx Unprivileged chạy quyền non-root
# ==============================================================================

# STAGE 1: Build React static assets
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Cài đặt toàn bộ dependencies
RUN npm install

# Copy toàn bộ source code
COPY . .

# Build bundle sang thư mục dist/
RUN npm run build

# ==============================================================================
# STAGE 2: Serve static files using Nginx Unprivileged
FROM nginxinc/nginx-unprivileged:alpine AS runner

# Sao chép file cấu hình server nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Sao chép tệp build từ Stage 1
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8080/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
