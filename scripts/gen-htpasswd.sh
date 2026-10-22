#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Script sinh tệp xác thực cơ bản HTTP Basic Auth (htpasswd)
# Đề 26: Hệ thống Quản lý Sự kiện
# ==============================================================================

OUTPUT_DIR="nginx/auth"
OUTPUT_FILE="${OUTPUT_DIR}/.htpasswd"
USERNAME="${1:-admin}"

mkdir -p "$OUTPUT_DIR"

if [[ -z "${2:-}" ]]; then
  PASSWORD=$(openssl rand -base64 12)
  echo "🔑 Mật khẩu tự sinh cho '$USERNAME': $PASSWORD"
else
  PASSWORD="$2"
fi

# Dùng OpenSSL sinh chuỗi băm apr1/md5/sha512 hoặc crypt
HASHED=$(openssl passwd -6 "$PASSWORD")

echo "${USERNAME}:${HASHED}" > "$OUTPUT_FILE"
chmod 600 "$OUTPUT_FILE"

echo "✅ Đã tạo tệp htpasswd tại: $OUTPUT_FILE"
echo "   - Username: $USERNAME"
echo "   - Hashed password ghi trong tệp bảo mật"
