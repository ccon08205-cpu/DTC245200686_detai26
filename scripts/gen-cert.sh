#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Script sinh chứng chỉ TLS/SSL tự ký (Self-signed Certificate) cho Nginx
# Đề 26: Hệ thống Quản lý Sự kiện (Event Management System)
# ==============================================================================

CERTS_DIR="nginx/certs"
CERT_KEY="${CERTS_DIR}/server.key"
CERT_CRT="${CERTS_DIR}/server.crt"
DAYS_VALID=365
DOMAIN="localhost"

mkdir -p "$CERTS_DIR"

if [[ -f "$CERT_KEY" && -f "$CERT_CRT" && "${1:-}" != "--force" ]]; then
  echo "⚠️  Chứng chỉ SSL đã tồn tại trong $CERTS_DIR!"
  echo "👉 Dùng './scripts/gen-cert.sh --force' nếu bạn muốn tạo lại."
  exit 0
fi

echo "🔐 Đang khởi tạo SSL Private Key và Self-Signed Certificate..."

# Tạo file cấu hình tạm thời OpenSSL với SAN
CONFIG_TEMP=$(mktemp)
cat <<EOF > "$CONFIG_TEMP"
[req]
default_bits        = 2048
prompt              = no
default_md          = sha256
distinguished_name  = req_distinguished_name
x509_extensions     = v3_req

[req_distinguished_name]
C   = VN
ST  = Hanoi
L   = Hanoi
O   = Eventify26
OU  = Security
CN  = ${DOMAIN}

[v3_req]
subjectAltName = @alt_names
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth

[alt_names]
DNS.1 = localhost
DNS.2 = *.localhost
DNS.3 = eventify26.local
DNS.4 = *.eventify26.local
IP.1  = 127.0.0.1
IP.2  = ::1
EOF

openssl req -x509 -nodes -days "$DAYS_VALID" \
  -newkey rsa:2048 \
  -keyout "$CERT_KEY" \
  -out "$CERT_CRT" \
  -config "$CONFIG_TEMP"

rm -f "$CONFIG_TEMP"

chmod 644 "$CERT_KEY"
chmod 644 "$CERT_CRT"

echo "✅ Đã tạo chứng chỉ SSL thành công:"
echo "   - Khóa bí mật (Private Key): $CERT_KEY (chmod 644)"
echo "   - Chứng chỉ (Certificate):    $CERT_CRT (chmod 644)"
echo "   - Hiệu lực:                   $DAYS_VALID ngày"
echo "   - Tên miền SAN:               localhost, 127.0.0.1, eventify26.local"
