# Đề 26: Hệ thống Quản lý Sự kiện / Event (Website tổ chức sự kiện, đăng ký tham dự, vé)

Hệ thống Quản lý Sự kiện & Đăng ký Vé trực tuyến chuẩn doanh nghiệp, xây dựng theo kiến trúc Microservices phân tách mạng đa tầng (Edge & App), bảo mật cao với HTTPS TLS tự ký, Nginx Unprivileged (Non-root), cơ sở dữ liệu PostgreSQL 17 và giám sát hệ thống thời gian thực với Prometheus & Grafana.

---

## 🏗️ Kiến trúc Tổng thể Dự án

```
                             [ TRÌNH DUYỆT / CLIENT ]
                                        │
                         HTTP :80 (Redirect 301) / HTTPS :443
                                        ▼
      ┌───────────────────────────────────────────────────────────────────┐
      │                         MẠNG EDGE (Ingress)                       │
      │                                                                   │
      │   ┌───────────────────────────────────────────────────────────┐   │
      │   │          NGINX REVERSE PROXY (Non-root UID 101)           │   │
      │   │  - SSL Termination (TLS 1.2 / 1.3)                        │   │
      │   │  - Security Headers (HSTS, CSP, X-Frame-Options, ...)     │   │
      │   │  - Rate Limiting: 10 req/s, burst=20 chống DoS / Spam     │   │
      │   └──────────────┬───────────────────┬───────────────────┬────┘   │
      │                  │ /                 │ /api/             │ /pgadmin/
      │                  ▼                   ▼                   ▼        │
      │   ┌────────────────────────┐  ┌─────────────┐  ┌─────────────┐   │
      │   │   FRONTEND CONTAINER   │  │   BACKEND   │  │  pgAdmin 4  │   │
      │   │  (React Vite + Nginx)  │  │  (Node.js)  │  │  (Port 80)  │   │
      │   └────────────────────────┘  └──────┬──────┘  └──────┬──────┘   │
      └──────────────────────────────────────┼────────────────┼───────────┘
                                             │                │
      ┌──────────────────────────────────────┼────────────────┼───────────┐
      │                                      ▼                ▼           │
      │                         POSTGRESQL 17 (Internal: 5432)            │
      │                       - Schema: events, tickets, attendees,       │
      │                                 audit_logs                        │
      │                       - Exclusion & Hard Check Constraints        │
      │                       - Least-privilege role: event_app           │
      │                                                                   │
      │                         MẠNG NỘI BỘ APP (Isolated)                │
      └───────────────────────────────────────────────────────────────────┘
```

---

## 📁 Cấu trúc Thư mục Dự án

```
.
├── backend/
│   ├── Dockerfile                  # Multi-stage Dockerfile chạy với user non-root (node)
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── db.ts                   # PostgreSQL Pool kết nối với user event_app
│       ├── index.ts                # Express app setup, rate-limiting & graceful shutdown
│       ├── metrics.ts              # Prometheus prom-client (Counter, Histogram, Gauge)
│       └── routes/
│           ├── admin.ts            # Quản trị viên (Overview stats, attendees, audit logs)
│           ├── events.ts           # Danh sách sự kiện & Chi tiết sự kiện
│           ├── health.ts           # Endpoint kiểm tra trạng thái /health
│           └── tickets.ts          # Đăng ký vé (Idempotency, Row-level Lock) & Tra cứu
├── frontend/
│   ├── Dockerfile                  # Multi-stage build React -> Nginx Unprivileged
│   ├── nginx.conf                  # Nginx nội bộ phục vụ static file SPA
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── App.jsx                 # Giao diện chính: Khám phá, Đăng ký vé, Tra cứu, Admin
│       ├── index.css               # Hệ thống Style Glassmorphism & Dark Mode cao cấp
│       └── main.jsx
├── monitoring/
│   ├── grafana/
│   │   └── provisioning/
│   │       ├── dashboards/dashboards.yml
│   │       └── datasources/datasources.yml
│   ├── loki/
│   │   └── loki-config.yml
│   ├── prometheus/
│   │   └── prometheus.yml          # Scrape cấu hình backend:3000/metrics
│   └── promtail/
│       └── promtail-config.yml
├── nginx/
│   ├── certs/                      # Thư mục chứa SSL cert & private key (server.crt, server.key)
│   ├── snippets/
│   │   └── security-headers.conf   # HSTS, CSP, X-Frame-Options, X-Content-Type-Options
│   └── nginx.conf                  # Nginx Reverse Proxy chính chạy non-root
├── postgres/
│   ├── init/
│   │   ├── 01-init-roles.sh        # Khởi tạo role event_app và pg_exporter (Least Privilege)
│   │   └── 02-schema.sql           # Schema DDL, Constraints, Triggers và Seed Data
│   └── pgadmin/
│       └── servers.json            # Cấu hình tự động kết nối PostgreSQL cho pgAdmin 4
├── scripts/
│   ├── gen-cert.sh                 # Sinh chứng chỉ SSL tự ký có SAN (Subject Alternative Names)
│   ├── gen-env.sh                  # Sinh .env ngẫu nhiên với mật khẩu mạnh
│   └── gen-htpasswd.sh             # Sinh tệp xác thực Basic Auth
├── .gitignore                      # Loại trừ .env, certs key, node_modules, logs
├── docker-compose.yml              # Quản lý 5 dịch vụ phân tách 2 mạng
└── README.md
```

---

## 🚀 Hướng dẫn Triển khai & Khởi chạy Nhanh

### Bước 1: Sinh Môi trường và Chứng chỉ SSL
```bash
# 1. Sinh file .env với mật khẩu ngẫu nhiên bảo mật cao
./scripts/gen-env.sh

# 2. Sinh chứng chỉ SSL tự ký cho localhost / eventify26.local
./scripts/gen-cert.sh
```

### Bước 2: Khởi chạy toàn bộ hệ thống bằng Docker Compose
```bash
docker compose up -d --build
```

### Bước 3: Kiểm tra trạng thái dịch vụ
```bash
docker compose ps
```

---

## 🌐 Các Đường dẫn Truy cập

| Dịch vụ | Giao thức & Cổng | Mô tả |
| :--- | :--- | :--- |
| **Trang chủ Website** | `https://localhost/` | Giao diện React: Khám phá sự kiện, Đặt vé, Tra cứu vé, Admin |
| **Chuyển hướng HTTP** | `http://localhost/` | Tự động chuyển hướng mã 301 sang `https://localhost/` |
| **API Danh sách Sự kiện** | `https://localhost/api/events` | REST API trả về danh sách sự kiện và giá vé |
| **API Tra cứu Vé** | `https://localhost/api/tickets/lookup?code=EVT-26-DEMO01` | Tra cứu chi tiết vé theo mã hoặc số điện thoại |
| **Health Check API** | `https://localhost/health` | Kiểm tra trạng thái máy chủ và kết nối database |
| **Prometheus Metrics** | `https://localhost/metrics` | Xuất số liệu chuẩn prom-client cho hệ thống giám sát |
| **pgAdmin 4 Web** | `https://localhost/pgadmin/` | Quản trị CSDL trực quan (kết nối sẵn đến Postgres) |

---

## 🔒 Các Tính năng Kỹ thuật & Bảo mật Nổi bật

1. **Chống Over-selling (Bán vượt quá số lượng vé) ở 2 tầng:**
   - **Tầng Ứng dụng:** Sử dụng câu lệnh `SELECT ... FOR UPDATE` trong Transaction để khóa dòng bản ghi loại vé, ngăn chặn race condition khi nhiều người cùng đặt vé một lúc.
   - **Tầng Cơ sở Dữ liệu:** Ràng buộc cứng `CONSTRAINT chk_no_oversell CHECK (quantity_sold <= quantity_total)`.
2. **Cơ chế Idempotency chống gửi trùng lặp:**
   - Client gửi kèm Header `Idempotency-Key`.
   - Nếu xảy ra timeout hoặc retry mạng, hệ thống kiểm tra và trả lại kết quả cũ mà không tạo thêm vé trùng lặp.
3. **Chống Spam vé:**
   - Ràng buộc `UNIQUE (event_id, phone)` đảm bảo mỗi số điện thoại chỉ đăng ký 1 vé cho mỗi sự kiện.
4. **Phân tách 2 Mạng Nội bộ (Network Segmentation):**
   - Mạng `edge`: Nginx tiếp nhận request bên ngoài và chuyển đến frontend/backend.
   - Mạng `app`: Mạng nội bộ cách ly, PostgreSQL không mở bất kỳ cổng nào ra máy host.
5. **Quyền hạn chế tối đa (Least Privilege):**
   - Backend kết nối qua user `event_app` (không dùng superuser `postgres`).
   - Nginx chạy container `nginx-unprivileged` với UID 101.
   - Backend chạy dưới user `node` (UID 1000).
