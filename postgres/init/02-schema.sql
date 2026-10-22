-- ==============================================================================
-- Schema cơ sở dữ liệu PostgreSQL 17
-- Đề 26: Hệ thống Quản lý Sự kiện / Event (Website tổ chức sự kiện, đăng ký tham dự, vé)
-- ==============================================================================

-- Bật các extensions cần thiết
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. BẢNG EVENTS (Sự kiện)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(100) NOT NULL DEFAULT 'Technology',
    location VARCHAR(255) NOT NULL,
    banner_url TEXT NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'ongoing', 'completed', 'cancelled')),
    max_capacity INT NOT NULL CHECK (max_capacity > 0),
    organizer_name VARCHAR(150) NOT NULL DEFAULT 'Ban Tổ Chức Đề 26',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_event_dates CHECK (end_time > start_time),
    CONSTRAINT no_overlap EXCLUDE USING gist (location WITH =, tstzrange(start_time, end_time) WITH &&)
);

CREATE INDEX IF NOT EXISTS idx_events_status_start ON events(status, start_time);
CREATE INDEX IF NOT EXISTS idx_events_slug ON events(slug);

-- ==============================================================================
-- 2. BẢNG TICKETS (Các loại vé của sự kiện)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    tier VARCHAR(50) NOT NULL DEFAULT 'STANDARD' CHECK (tier IN ('EARLY_BIRD', 'STANDARD', 'VIP', 'STUDENT')),
    price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
    quantity_total INT NOT NULL CHECK (quantity_total > 0),
    quantity_sold INT NOT NULL DEFAULT 0 CHECK (quantity_sold >= 0),
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- RÀNG BUỘC CỐT LÕI TẦNG DB: Ngăn chặn tuyệt đối việc bán vượt quá số lượng vé cho phép
    CONSTRAINT chk_no_oversell CHECK (quantity_sold <= quantity_total),
    CONSTRAINT uq_event_ticket_name UNIQUE (event_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tickets_event_id ON tickets(event_id);

-- ==============================================================================
-- 3. BẢNG ATTENDEES (Người đăng ký vé tham dự sự kiện)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS attendees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE RESTRICT,
    ticket_code VARCHAR(32) UNIQUE NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'checked_in', 'cancelled')),
    
    -- RÀNG BUỘC IDEMPOTENCY: Chống duplicate do retry mạng từ phía client/gateway
    idempotency_key VARCHAR(128) UNIQUE NOT NULL,

    check_in_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- RÀNG BUỘC CHỐNG ĐĂNG KÝ TRÙNG: Mỗi số điện thoại chỉ được đăng ký 1 vé trên mỗi sự kiện
    CONSTRAINT uq_attendee_event_phone UNIQUE (event_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_attendees_lookup ON attendees(ticket_code, phone);
CREATE INDEX IF NOT EXISTS idx_attendees_event_id ON attendees(event_id);
CREATE INDEX IF NOT EXISTS idx_attendees_email ON attendees(email);

-- ==============================================================================
-- 4. BẢNG AUDIT_LOGS (Ghi nhật ký kiểm tra hệ thống)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    action VARCHAR(100) NOT NULL,
    entity VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100),
    actor VARCHAR(100) NOT NULL DEFAULT 'system',
    payload JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- ==============================================================================
-- 5. TRIGGER TỰ ĐỘNG CẬP NHẬT UPDATED_AT
-- ==============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_events_updated_at ON events;
CREATE TRIGGER trg_events_updated_at
    BEFORE UPDATE ON events
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_tickets_updated_at ON tickets;
CREATE TRIGGER trg_tickets_updated_at
    BEFORE UPDATE ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- 6. PHÂN QUYỀN CHO USER ỨNG DỤNG (Least Privilege)
-- ==============================================================================
DO $$
DECLARE
    app_user TEXT := 'event_app';
BEGIN
    IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = app_user) THEN
        EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', app_user);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', app_user);
        EXECUTE format('GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO %I', app_user);
        EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I', app_user);
        EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO %I', app_user);
        RAISE NOTICE 'Permissions granted to %', app_user;
    END IF;
END
$$;

-- ==============================================================================
-- 7. SEED DỮ LIỆU BAN ĐẦU CHO HỆ THỐNG
-- ==============================================================================
INSERT INTO events (id, title, slug, description, category, location, banner_url, start_time, end_time, status, max_capacity, organizer_name)
VALUES
(
    '00000000-0000-0000-0000-000000000001',
    'Tech Summit Vietnam 2026: Kỷ Nguyên AI & Cloud Native',
    'tech-summit-vietnam-2026',
    'Hội nghị công nghệ hàng đầu năm 2026 quy tụ hơn 50 diễn giả quốc tế, thảo luận về Trí tuệ nhân tạo thế hệ mới, kiến trúc Microservices, Kubernetes và DevOps an ninh cao.',
    'Technology',
    'Trung tâm Hội nghị Quốc gia, Hà Nội',
    'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1200&q=80',
    CURRENT_TIMESTAMP + INTERVAL '10 days',
    CURRENT_TIMESTAMP + INTERVAL '12 days',
    'published',
    1000,
    'Hiệp hội Công nghệ & Đổi mới Sáng tạo'
),
(
    '00000000-0000-0000-0000-000000000002',
    'Lễ Hội Âm Nhạc & Nghệ Thuật Ánh Sáng: SoundWave 2026',
    'soundwave-festival-2026',
    'Đại nhạc hội ngoài trời bùng nổ với sự góp mặt của các nghệ sĩ hàng đầu, kết hợp trình diễn ánh sáng 3D mapping và trải nghiệm âm thanh đa tầng sống động.',
    'Music',
    'Công viên Bờ sông Sài Gòn, TP. Hồ Chí Minh',
    'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1200&q=80',
    CURRENT_TIMESTAMP + INTERVAL '20 days',
    CURRENT_TIMESTAMP + INTERVAL '21 days',
    'published',
    2500,
    'SoundWave Media Entertainment'
),
(
    '00000000-0000-0000-0000-000000000003',
    'Giải Chạy Marathon Quốc Tế Vì Trái Tim 2026',
    'marathon-vi-trai-tim-2026',
    'Giải chạy thường niên vì sức khỏe cộng đồng với các cự ly 5km, 10km, 21km và 42km dọc theo cung đường ven biển tuyệt đẹp.',
    'Sports',
    'Quảng trường 2 Tháng 4, Nha Trang, Khánh Hòa',
    'https://images.unsplash.com/photo-1530549387789-4c1017266635?auto=format&fit=crop&w=1200&q=80',
    CURRENT_TIMESTAMP + INTERVAL '30 days',
    CURRENT_TIMESTAMP + INTERVAL '31 days',
    'published',
    5000,
    'Liên đoàn Điền kinh Việt Nam'
),
(
    '00000000-0000-0000-0000-000000000004',
    'Diễn Đàn Khởi Nghiệp Đổi Mới Sáng Tạo: Startup Pitch 2026',
    'startup-pitch-2026',
    'Cơ hội kết nối trực tiếp với 100+ Quỹ đầu tư mạo hiểm (VCs), các chuyên gia tăng tốc khởi nghiệp và các doanh nhân kỳ lân công nghệ.',
    'Business',
    'Landmark 81, TP. Hồ Chí Minh',
    'https://images.unsplash.com/photo-1515187029135-18ee286d815b?auto=format&fit=crop&w=1200&q=80',
    CURRENT_TIMESTAMP + INTERVAL '15 days',
    CURRENT_TIMESTAMP + INTERVAL '16 days',
    'published',
    500,
    'Vietnam Startup Network'
)
ON CONFLICT (id) DO NOTHING;

-- Seed Tickets cho các sự kiện
INSERT INTO tickets (id, event_id, name, tier, price, quantity_total, quantity_sold, description)
VALUES
-- Sự kiện 1: Tech Summit
('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Vé Tiêu Chuẩn (Standard)', 'STANDARD', 250000.00, 500, 1, 'Bao gồm quyền tham dự toàn bộ các phiên hội thảo và teabreak.'),
('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Vé VIP (VIP Pass)', 'VIP', 750000.00, 100, 0, 'Ngồi hàng ghế đầu, tiệc trưa buffet cùng diễn giả và bộ quà tặng công nghệ cao cấp.'),
('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Vé Sinh Viên (Student)', 'STUDENT', 99000.00, 200, 0, 'Yêu cầu xuất trình thẻ sinh viên hợp lệ khi làm thủ tục check-in.'),

-- Sự kiện 2: Âm nhạc
('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', 'Vé Early Bird (Phổ Thông)', 'EARLY_BIRD', 350000.00, 800, 0, 'Khu vực GA đứng, ưu đãi đặt sớm số lượng có hạn.'),
('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000002', 'Vé VIP Sound Lounge', 'VIP', 1200000.00, 200, 0, 'Khu vực bục cao riêng biệt, thức uống miễn phí và lối đi VIP.'),

-- Sự kiện 3: Marathon
('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000003', 'Bib Cự Ly 10KM', 'STANDARD', 400000.00, 1500, 0, 'Bao gồm áo thi đấu, race-kit, số bib gắn chip timing và huy chương hoàn thành.'),
('10000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000003', 'Bib Cự Ly Bán Marathon 21KM', 'STANDARD', 600000.00, 1000, 0, 'Bộ race-kit cao cấp kèm chứng nhận thời gian thi đấu chuẩn quốc tế.'),

-- Sự kiện 4: Startup
('10000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000004', 'Vé Người Tham Dự (Attendee)', 'STANDARD', 150000.00, 300, 0, 'Tham dự phiên thuyết trình và giao lưu kết nối.')
ON CONFLICT (id) DO NOTHING;

-- Seed Sample Attendee
INSERT INTO attendees (id, event_id, ticket_id, ticket_code, full_name, email, phone, status, idempotency_key)
VALUES
(
    '20000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'EVT-26-DEMO01',
    'Nguyễn Văn An',
    'an.nguyen@example.com',
    '0901234567',
    'confirmed',
    'seed-idempotency-key-001'
)
ON CONFLICT (id) DO NOTHING;

-- Seed Audit Log
INSERT INTO audit_logs (action, entity, entity_id, actor, payload)
VALUES
(
    'SEED_DATABASE',
    'system',
    'initialization',
    'system',
    '{"message": "Khởi tạo dữ liệu mẫu thành công cho Đề 26: Quản lý Sự kiện"}'::jsonb
);
