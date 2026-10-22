# Đề 26: Hệ thống Quản lý Sự kiện / Event (Website tổ chức sự kiện, đăng ký tham dự, vé)

Hệ thống Quản lý Sự kiện & Đăng ký Vé trực tuyến chuẩn Production, xây dựng theo kiến trúc Microservices phân tách 4 mạng nội bộ độc lập (`edge`, `app`, `monitor`, `egress`), áp dụng triệt để các tiêu chuẩn **Gia cố bảo mật hệ thống (Hardening)** và tích hợp hệ sinh thái **Giám sát & Quản lý Nhật ký tập trung (Prometheus + Grafana + Loki + Promtail + cAdvisor + Exporters)**.

---

## 🏗️ Kiến trúc Mạng & Dịch vụ Tổng thể

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
      │   │  - Publish Port Host duy nhất: :80 và :443                │   │
      │   │  - SSL Termination (TLS 1.2 / 1.3), JSON Access Logging   │   │
      │   │  - OWASP Security Headers (HSTS, CSP, X-Frame-Options...) │   │
      │   │  - Rate Limiting: 10 req/s, burst=20 chống DoS / Spam     │   │
      │   └──┬─────────────┬──────────────┬────────────┬──────────┬───┘   │
      │      │ /           │ /api/        │ /pgadmin/  │ /grafana/│ /prometheus/
      │      ▼             ▼              ▼            │          │       │
      │   ┌──────────┐  ┌──────────┐  ┌──────────┐     │          │       │
      │   │ FRONTEND │  │ BACKEND  │  │ pgAdmin  │     │          │       │
      │   │  (React) │  │ (NodeJS) │  │  (Web)   │     │          │       │
      │   └──────────┘  └──┬───────┘  └──┬───────┘     │          │       │
      └────────────────────┼─────────────┼─────────────┼──────────┼───────┘
                           │             │             │          │
      ┌────────────────────┼─────────────┼─────────────┴──────────┴───────┐
      │                    │             │                                │
      │                    │             │   ┌────────────────────────┐   │
      │                    │             │   │       PROMETHEUS       │   │
      │                    │             │   │ (Metrics Scrape & Alert)   │
      │                    │             │   └───────────▲────────────┘   │
      │                    │             │               │ scrape 15s     │
      │                    │             │   ┌───────────┴────────────┐   │
      │                    │             │   │      GRAFANA 13.2      │   │
      │                    │             │   │ (Dashboards & LogQL)   │   │
      │                    │             │   └───────────▲────────────┘   │
      │                    │             │               │ LogQL          │
      │                    │             │   ┌───────────┴────────────┐   │
      │                    │             │   │      GRAFANA LOKI      │   │
      │                    │             │   │ (Lưu trữ Log 7 ngày)   │   │
      │                    │             │   └───────────▲────────────┘   │
      │                    │             │               │ push log       │
      │                    │             │   ┌───────────┴────────────┐   │
      │                    │             │   │        PROMTAIL        │   │
      │                    │             │   │ (Docker JSON log ship) │   │
      │                    │             │   └────────────────────────┘   │
      │                    │             │                                │
      │                    ▼             ▼                                │
      │   ┌───────────────────────────────────────────────────────────┐   │
      │   │            cAdvisor (gcr.io/cadvisor:v0.55.1)             │   │
      │   │            Postgres-Exporter + Nginx-Exporter             │   │
      │   │                                                           │   │
      │   │                 MẠNG MONITOR (Internal: true)             │   │
      │   └───────────────────────────────────────────────────────────┘   │
      │                                                                   │
      └───────────────────────────────────┬───────────────────────────────┘
                                          │
      ┌───────────────────────────────────┴───────────────────────────────┐
      │                                   ▼                               │
      │                      POSTGRESQL 17 (Internal)                     │
      │                    - DB: eventdb (Port 5432 nội bộ)               │
      │                    - Giới hạn quyền: user event_app               │
      │                    - Ràng buộc: no_overlap & no_oversell          │
      │                                                                   │
      │                      MẠNG APP (Internal: true)                    │
      └───────────────────────────────────────────────────────────────────┘
```

---

## 🌐 Danh bạ Dịch vụ & Cổng Truy cập

> [!NOTE]
> Hệ thống áp dụng **Network Isolation tuyệt đối**: Chỉ duy nhất **Nginx** mở cổng ra máy chủ host (`:80` và `:443`). Mọi dịch vụ khác giao tiếp qua mạng Docker Bridge nội bộ.

| Dịch vụ | URL Truy cập (Ngoại vi) | Cổng Nội bộ | Tài khoản / Quyền |
| :--- | :--- | :--- | :--- |
| **Giao diện Người dùng (React SPA)** | `https://localhost/` | `frontend:8080` | Công khai |
| **Tự động chuyển hướng HTTP** | `http://localhost/` | `nginx:8080` -> `301` | Chuyển sang HTTPS |
| **REST API Backend** | `https://localhost/api/events` | `backend:3000` | Công khai / Token |
| **Đăng ký vé (Idempotency)** | `POST https://localhost/api/tickets/register` | `backend:3000` | Header `Idempotency-Key` |
| **Health Check Hệ thống** | `https://localhost/health` | `backend:3000` | Công khai (`healthy: true`) |
| **Prometheus Web UI & API** | `https://localhost/prometheus/` | `prometheus:9090` | Basic Auth: `prometheus` / `PrometheusSecurePass2026!` |
| **Grafana Dashboards** | `https://localhost/grafana/` | `grafana:3000` | Admin: `admin` / `BwsnezwYz8Dywdp5mN8qR4tV` |
| **Quản trị CSDL pgAdmin 4** | `https://localhost/pgadmin/` | `pgadmin:80` | `admin@eventify26.com` / `yHEzp6fI0OmzBvoQ9kL2xP5w` |
| **Loki Log Gateway** | Nội bộ qua Grafana Datasource | `loki:3100` | Internal network `monitor` |

---

## 🚀 Hướng dẫn Triển khai & Vận hành

### 1. Sinh Chứng chỉ SSL & Môi trường Bí mật
```bash
# 1. Sinh chứng chỉ SSL tự ký có Subject Alternative Name (SAN: localhost, 127.0.0.1, eventify26.local)
./scripts/gen-cert.sh

# 2. Sinh mật khẩu ngẫu nhiên >= 24 ký tự vào .env
./scripts/gen-env.sh
```

### 2. Khởi chạy toàn bộ hệ thống bằng Docker Compose
```bash
docker compose up -d --build
```

### 3. Kiểm tra trạng thái 12 Containers
```bash
docker compose ps
```

Tất cả container đều phải đạt trạng thái `Up (healthy)` hoặc `Up`.

---

## 📊 Hệ thống Nhật ký tập trung Loki & 5 Truy vấn LogQL

Log từ tất cả container được Docker ghi dạng `json-file`, Promtail thu thập theo chế độ **Read-Only** (`/var/lib/docker/containers:ro`), gắn nhãn metadata (`service`, `container`, `project`) và đẩy về Loki lưu trữ tối đa **7 ngày** (168 giờ).

Dashboard **"Nhật ký tập trung (Loki) - Đề 26"** đã được cấu hình tự động (Provisioning) trong Grafana với sẵn 5 câu truy vấn LogQL nghiệp vụ:

| STT | Tên mục tiêu | Câu truy vấn LogQL | Ý nghĩa & Ứng dụng |
| :---: | :--- | :--- | :--- |
| **1** | **Log lỗi Nginx** | `{service="nginx"} \| json \| status >= 400` | Lọc tức thời mọi request bị lỗi Client (4xx) hoặc Server (5xx) từ Nginx. |
| **2** | **Log đặt vé trùng bị chặn 409** | `{service="backend"} \| json \| status="409"` | Phát hiện người dùng cố tình hoặc vô ý dùng lại số điện thoại đã mua vé cho cùng sự kiện. |
| **3** | **CSDL vi phạm ràng buộc exclusion** | `{service="postgres"} \|= "no_overlap"` | Giám sát các giao dịch thêm sự kiện bị PostgreSQL chặn do trùng địa điểm và khung giờ (`no_overlap`). |
| **4** | **Thống kê request Nginx theo thời gian** | `sum by (status) (count_over_time({service="nginx"} \| json \| __error__="" [1m]))` | Vẽ biểu đồ Time-series phân bố số lượng request theo mã trạng thái HTTP (200, 404, 409, 500...). |
| **5** | **Truy vết request theo request_id** | `{service=~"nginx\|backend"} \|= "$request_id"` | Truy vết xuyên suốt (End-to-End Tracing) một request cụ thể đi từ Nginx Reverse Proxy vào Backend Express. |

### Lệnh cURL kiểm chứng trực tiếp từng câu truy vấn LogQL:

```bash
# Query 1: Lỗi Nginx status >= 400
docker exec eventify_prometheus wget -qO- 'http://loki:3100/loki/api/v1/query_range?query=%7Bservice%3D%22nginx%22%7D%20%7C%20json%20%7C%20status%20%3E%3D%20400&limit=5' | jq .data.result

# Query 2: Lỗi đặt vé trùng 409 từ Backend
docker exec eventify_prometheus wget -qO- 'http://loki:3100/loki/api/v1/query_range?query=%7Bservice%3D%22backend%22%7D%20%7C%20json%20%7C%20status%3D%22409%22&limit=5' | jq .data.result

# Query 3: Vi phạm exclusion constraint no_overlap trên Postgres
docker exec eventify_prometheus wget -qO- 'http://loki:3100/loki/api/v1/query_range?query=%7Bservice%3D%22postgres%22%7D%20%7C%3D%20%22no_overlap%22&limit=5' | jq .data.result

# Query 4: Thống kê request theo status code
docker exec eventify_prometheus wget -qO- 'http://loki:3100/loki/api/v1/query_range?query=sum%20by%20(status)%20(count_over_time(%7Bservice%3D%22nginx%22%7D%20%7C%20json%20%7C%20__error__%3D%22%22%20%5B5m%5D))' | jq .data.result

# Query 5: Truy vết theo mã Request-ID
docker exec eventify_prometheus wget -qO- 'http://loki:3100/loki/api/v1/query_range?query=%7Bservice%3D~%22nginx%7Cbackend%22%7D%20%7C%3D%20%22<MA_REQUEST_ID>%22' | jq .data.result
```

---

## 🛡️ Bảng Tổng hợp Biện pháp Hardening & Lệnh Kiểm chứng

Hệ thống được gia cố toàn diện ở 6 lớp bảo mật theo khuyến nghị CIS Docker Benchmark và OWASP Top 10:

| Lớp bảo mật | Biện pháp Hardening áp dụng | Dịch vụ thực hiện | Lệnh kiểm chứng | Kết quả mong đợi |
| :--- | :--- | :--- | :--- | :--- |
| **1. Non-root Execution** | Chạy container bằng user không đặc quyền (`node`, `nginx`, `postgres`, `nobody:65534`, `472:472`, `10001:10001`). | Toàn bộ backend, frontend, nginx, postgres, prometheus, grafana, loki. | `docker inspect eventify_nginx --format 'UID: {{.Config.User}}'`<br>`docker inspect eventify_prometheus --format 'User: {{.Config.User}}'` | Không trả về root (`""` hoặc `101`, `65534:65534`, `472:472`, `10001:10001`). |
| **2. Network Isolation** | Tạo 4 mạng riêng biệt (`edge`, `app`, `monitor`, `egress`). Chỉ duy nhất Nginx publish cổng host. | Nginx mở `80, 443`. PostgreSQL, Exporters, Prometheus, Loki cách ly mạng nội bộ (`internal: true`). | `docker network ls \| grep eventify`<br>`docker inspect eventify_postgres --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}'` | Hiện 4 mạng `eventify_*`. Postgres chỉ thuộc mạng `eventify_app`. |
| **3. Security Headers** | Thiết lập HSTS (`preload`), CSP chặt chẽ, X-Frame-Options (`SAMEORIGIN`), X-Content-Type-Options (`nosniff`), Referrer-Policy, tắt `server_tokens`. | Nginx Reverse Proxy (`nginx/snippets/security-headers.conf`). | `curl -skI https://localhost/` | Trả về đủ các header bảo mật, không để lộ phiên bản Nginx (`Server: nginx`). |
| **4. Resource Limits** | Giới hạn CPU (`cpus`) và bộ nhớ RAM (`memory`) trong `deploy.resources.limits` chống tấn công cạn kiệt tài nguyên (DoS/OOM). | Toàn bộ 12 container trong `docker-compose.yml`. | `docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.MemLimit}}"` | Hiển thị trần CPU/RAM cố định (ví dụ trần 512MiB cho Backend/Postgres). |
| **5. Privilege Restrictions** | Bật `no-new-privileges:true`, thu hồi toàn bộ Linux Capabilities (`cap_drop: [ALL]`), kích hoạt `read_only: true` kèm `tmpfs`. | Backend, Frontend, Nginx, Prometheus, Grafana, Loki, Exporters. | `docker inspect eventify_backend --format 'ReadOnly: {{.HostConfig.ReadonlyRootfs}}, SecOpt: {{.HostConfig.SecurityOpt}}, CapDrop: {{.HostConfig.CapDrop}}'` | `ReadOnly: true`, `SecOpt: [no-new-privileges:true]`, `CapDrop: [ALL]`. |
| **6. Secret Management** | Sinh mật khẩu ngẫu nhiên bảo mật cao độ dài ≥ 24 ký tự. Đưa `.env`, SSL private key, `.htpasswd*` vào `.gitignore`. | `.env`, `nginx/certs/`, `nginx/auth/`. | `git status --ignored`<br>`wc -c <(grep PASSWORD .env)` | Không có tệp bí mật nào bị theo dõi bởi Git. Mọi mật khẩu đều ≥ 24 ký tự. |

---

## 📈 Giám sát Prometheus Alert Rules

Hệ thống cấu hình 6 luật cảnh báo chuẩn SRE trong `monitoring/prometheus/alerts.yml`:

| Tên Alert | Mức độ | Điều kiện kích hoạt | Xử lý tự động |
| :--- | :---: | :--- | :--- |
| **TargetDown** | Critical | `up == 0` trong 1 phút | Báo động khi bất kỳ container nào bị sập hoặc ngừng phản hồi. |
| **PostgresDown** | Critical | `pg_up == 0` trong 30 giây | Báo động khi DB Postgres ngắt kết nối. |
| **NginxDown** | Critical | `up{job="nginx"} == 0` trong 1 phút | Báo động khi Reverse Proxy Nginx ngừng hoạt động. |
| **BackendHighErrorRate** | Warning | Tỉ lệ lỗi HTTP 5xx > 5% trong 5 phút | Phát hiện lỗi code, unhandled exceptions hoặc timeout DB. |
| **BackendSlowResponses** | Warning | p95 latency > 2s trong 5 phút | Phát hiện suy giảm hiệu năng hoặc câu truy vấn chậm (slow query). |
| **ContainerMemoryNearLimit** | Warning | RAM container > 85% giới hạn spec trong 5 phút | Cảnh báo trước nguy cơ bị hệ điều hành OOMKilled. |

---

## 🎯 Kiểm thử Nghiệp vụ & Đăng ký Vé

```bash
# 1. Tra cứu danh sách sự kiện kèm giá vé
curl -sk https://localhost/api/events | jq .

# 2. Đăng ký vé thành công với Idempotency-Key
curl -sk -X POST https://localhost/api/tickets/register \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: IDEMP-$(date +%s)" \
  -d '{
    "event_id": "00000000-0000-0000-0000-000000000001",
    "ticket_id": "10000000-0000-0000-0000-000000000001",
    "full_name": "Trần Thị Bình",
    "email": "binh.tran@example.com",
    "phone": "0987654321"
  }' | jq .

# 3. Tra cứu vé đã phát hành theo số điện thoại hoặc mã vé
curl -sk "https://localhost/api/tickets/lookup?phone=0987654321" | jq .
```
