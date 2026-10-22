#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Script khởi tạo vai trò (Roles) trong PostgreSQL 17
# Đề 26: Hệ thống Quản lý Sự kiện
# Tuân thủ nguyên tắc Least Privilege (Quyền tối thiểu)
# ==============================================================================

echo "🚀 [Postgres Init] Bắt đầu khởi tạo các User ứng dụng & Exporter..."

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- 1. Tạo Application Role (nếu chưa có)
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${APP_DB_USER}') THEN
            CREATE ROLE ${APP_DB_USER} WITH LOGIN PASSWORD '${APP_DB_PASSWORD}';
            RAISE NOTICE 'Role % created successfully.', '${APP_DB_USER}';
        ELSE
            ALTER ROLE ${APP_DB_USER} WITH PASSWORD '${APP_DB_PASSWORD}';
            RAISE NOTICE 'Role % updated password.', '${APP_DB_USER}';
        END IF;
    END
    \$\$;

    -- 2. Tạo Exporter Role (nếu chưa có) cho Prometheus postgres_exporter
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${EXPORTER_DB_USER}') THEN
            CREATE ROLE ${EXPORTER_DB_USER} WITH LOGIN PASSWORD '${EXPORTER_DB_PASSWORD}';
            RAISE NOTICE 'Role % created successfully.', '${EXPORTER_DB_USER}';
        ELSE
            ALTER ROLE ${EXPORTER_DB_USER} WITH PASSWORD '${EXPORTER_DB_PASSWORD}';
            RAISE NOTICE 'Role % updated password.', '${EXPORTER_DB_USER}';
        END IF;
    END
    \$\$;

    -- 3. Cấp quyền hạn chế cho exporter (chỉ đọc metrics hệ thống)
    GRANT pg_monitor TO ${EXPORTER_DB_USER};
    GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO ${EXPORTER_DB_USER};

    -- 4. Cấp quyền kết nối cho app_user
    GRANT CONNECT, CREATE ON DATABASE ${POSTGRES_DB} TO ${APP_DB_USER};
EOSQL

echo "✅ [Postgres Init] Hoàn tất khởi tạo User & Phân quyền bảo mật!"
