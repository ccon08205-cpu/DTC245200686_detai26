#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Script sinh file .env với mật khẩu bảo mật ngẫu nhiên
# Đề 26: Hệ thống Quản lý Sự kiện (Event Management System)
# ==============================================================================

ENV_FILE=".env"
EXAMPLE_FILE=".env.example"
FORCE=false

if [[ "${1:-}" == "--force" ]]; then
  FORCE=true
fi

if [[ -f "$ENV_FILE" && "$FORCE" != true ]]; then
  echo "⚠️  File $ENV_FILE đã tồn tại!"
  echo "👉 Dùng './scripts/gen-env.sh --force' nếu bạn muốn ghi đè."
  exit 0
fi

# Hàm sinh chuỗi ngẫu nhiên mạnh bằng OpenSSL
generate_password() {
  local length="${1:-24}"
  openssl rand -base64 48 | tr -dc 'A-Za-z0-9!@#%^&*' | head -c "$length"
}

generate_hex() {
  local length="${1:-32}"
  openssl rand -hex "$length"
}

echo "🔐 Đang sinh các bí mật ngẫu nhiên an toàn..."

POSTGRES_DB="eventdb"
POSTGRES_USER="postgres"
POSTGRES_PASSWORD=$(generate_password 24)

APP_DB_USER="event_app"
APP_DB_PASSWORD=$(generate_password 24)

EXPORTER_DB_USER="event_exporter"
EXPORTER_DB_PASSWORD=$(generate_password 24)

PGADMIN_DEFAULT_EMAIL="admin@eventify26.com"
PGADMIN_DEFAULT_PASSWORD=$(generate_password 16)

JWT_SECRET=$(generate_hex 32)
PORT="3000"
NODE_ENV="production"

# Ghi file .env
cat <<EOF > "$ENV_FILE"
# ==============================================================================
# Tệp cấu hình biến môi trường - Đề 26: Hệ thống Quản lý Sự kiện
# Sinh tự động vào lúc: $(date -u +"%Y-%m-%d %H:%M:%SZ")
# ==============================================================================

# Node Environment & Port
NODE_ENV=${NODE_ENV}
PORT=${PORT}
CORS_ORIGIN=https://localhost,https://127.0.0.1
JWT_SECRET=${JWT_SECRET}

# PostgreSQL Database (Superuser)
POSTGRES_DB=${POSTGRES_DB}
POSTGRES_USER=${POSTGRES_USER}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_HOST=postgres
POSTGRES_PORT=5432

# Application Database Role (Least Privilege)
APP_DB_USER=${APP_DB_USER}
APP_DB_PASSWORD=${APP_DB_PASSWORD}

# Metrics Exporter Database Role (ReadOnly / pg_monitor)
EXPORTER_DB_USER=${EXPORTER_DB_USER}
EXPORTER_DB_PASSWORD=${EXPORTER_DB_PASSWORD}

# pgAdmin 4 Configuration
PGADMIN_DEFAULT_EMAIL=${PGADMIN_DEFAULT_EMAIL}
PGADMIN_DEFAULT_PASSWORD=${PGADMIN_DEFAULT_PASSWORD}
PGADMIN_CONFIG_SERVER_MODE=False
PGADMIN_LISTEN_PORT=80

# Monitoring
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=$(generate_password 16)
EOF

# Ghi file .env.example (mẫu không chứa mật khẩu thật)
cat <<EOF > "$EXAMPLE_FILE"
# Node Environment & Port
NODE_ENV=production
PORT=3000
CORS_ORIGIN=https://localhost,https://127.0.0.1
JWT_SECRET=your_super_secret_jwt_key_here

# PostgreSQL Database (Superuser)
POSTGRES_DB=eventdb
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_strong_postgres_password
POSTGRES_HOST=postgres
POSTGRES_PORT=5432

# Application Database Role
APP_DB_USER=event_app
APP_DB_PASSWORD=your_strong_app_password

# Metrics Exporter Database Role
EXPORTER_DB_USER=event_exporter
EXPORTER_DB_PASSWORD=your_strong_exporter_password

# pgAdmin 4 Configuration
PGADMIN_DEFAULT_EMAIL=admin@eventify26.com
PGADMIN_DEFAULT_PASSWORD=your_strong_pgadmin_password
PGADMIN_CONFIG_SERVER_MODE=False
PGADMIN_LISTEN_PORT=80

# Monitoring
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=your_strong_grafana_password
EOF

chmod 600 "$ENV_FILE"

echo "✅ Đã tạo thành công file $ENV_FILE và $EXAMPLE_FILE!"
echo "---------------------------------------------------------"
echo "📋 Thông tin khởi tạo:"
echo "   - Database Name:      $POSTGRES_DB"
echo "   - App DB User:        $APP_DB_USER"
echo "   - pgAdmin Email:      $PGADMIN_DEFAULT_EMAIL"
echo "   - File quyền hạn:     chmod 600 $ENV_FILE"
echo "---------------------------------------------------------"
