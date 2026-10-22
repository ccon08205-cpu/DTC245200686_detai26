import React, { useState, useEffect } from 'react';
import {
  Calendar,
  MapPin,
  Ticket,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  Users,
  ShieldCheck,
  TrendingUp,
  PlusCircle,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  X,
  CreditCard,
  QrCode,
  Copy,
  LayoutDashboard,
  Filter
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('events'); // 'events' | 'lookup' | 'admin'
  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Modal State for Event Detail & Registration
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedTier, setSelectedTier] = useState(null);
  const [registerForm, setRegisterForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    idempotencyKey: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registrationResult, setRegistrationResult] = useState(null);
  const [registrationError, setRegistrationError] = useState(null);

  // Ticket Lookup State
  const [lookupQuery, setLookupQuery] = useState({ code: '', phone: '' });
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResults, setLookupResults] = useState(null);
  const [lookupError, setLookupError] = useState(null);

  // Admin Dashboard State
  const [adminStats, setAdminStats] = useState(null);
  const [adminAttendees, setAdminAttendees] = useState([]);
  const [adminAuditLogs, setAdminAuditLogs] = useState([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newEvent, setNewEvent] = useState({
    title: '',
    description: '',
    category: 'Technology',
    location: '',
    banner_url: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1200&q=80',
    start_time: '',
    end_time: '',
    max_capacity: 500,
    price: 200000,
    ticket_name: 'Vé Tiêu Chuẩn',
  });

  // Tải danh sách sự kiện
  const fetchEvents = async () => {
    try {
      setLoadingEvents(true);
      const res = await fetch('/api/events');
      const data = await res.json();
      if (data.success) {
        setEvents(data.data);
      }
    } catch (err) {
      console.error('Lỗi tải sự kiện:', err);
    } finally {
      setLoadingEvents(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  // Mở Modal xem chi tiết và đăng ký sự kiện
  const handleOpenRegister = async (event) => {
    try {
      const res = await fetch(`/api/events/${event.id}`);
      const data = await res.json();
      if (data.success) {
        setSelectedEvent(data.data);
        if (data.data.tickets && data.data.tickets.length > 0) {
          // Chọn mặc định vé đầu tiên còn chỗ
          const available = data.data.tickets.find((t) => t.quantity_remaining > 0);
          setSelectedTier(available || data.data.tickets[0]);
        }
        // Khởi tạo Idempotency Key tự sinh cho phiên này
        const clientKey = 'idemp_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
        setRegisterForm({ full_name: '', email: '', phone: '', idempotencyKey: clientKey });
        setRegistrationResult(null);
        setRegistrationError(null);
      }
    } catch (err) {
      console.error('Lỗi tải chi tiết sự kiện:', err);
    }
  };

  // Submit đăng ký vé với Idempotency Key
  const handleSubmitRegistration = async (e) => {
    e.preventDefault();
    if (!selectedTier || selectedTier.quantity_remaining <= 0) {
      setRegistrationError('Hạng vé này đã hết chỗ!');
      return;
    }

    try {
      setIsSubmitting(true);
      setRegistrationError(null);

      const response = await fetch('/api/tickets/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': registerForm.idempotencyKey,
        },
        body: JSON.stringify({
          event_id: selectedEvent.id,
          ticket_id: selectedTier.id,
          full_name: registerForm.full_name,
          email: registerForm.email,
          phone: registerForm.phone,
          idempotency_key: registerForm.idempotencyKey,
        }),
      });

      const resData = await response.json();
      if (response.ok && resData.success) {
        setRegistrationResult(resData.data);
        fetchEvents(); // Cập nhật lại số vé còn lại ngoài trang chủ
      } else {
        setRegistrationError(resData.message || 'Đăng ký vé thất bại');
      }
    } catch (err) {
      setRegistrationError('Không thể kết nối đến máy chủ. Vui lòng thử lại sau.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Tra cứu vé
  const handleLookup = async (e) => {
    e.preventDefault();
    if (!lookupQuery.code && !lookupQuery.phone) {
      setLookupError('Vui lòng nhập Mã vé hoặc Số điện thoại để tra cứu!');
      return;
    }

    try {
      setLookupLoading(true);
      setLookupError(null);
      setLookupResults(null);

      const params = new URLSearchParams();
      if (lookupQuery.code) params.append('code', lookupQuery.code.trim());
      if (lookupQuery.phone) params.append('phone', lookupQuery.phone.trim());

      const res = await fetch(`/api/tickets/lookup?${params.toString()}`);
      const data = await res.json();

      if (res.ok && data.success) {
        setLookupResults(data.data);
      } else {
        setLookupError(data.message || 'Không tìm thấy thông tin vé phù hợp.');
      }
    } catch (err) {
      setLookupError('Lỗi kết nối máy chủ tra cứu vé.');
    } finally {
      setLookupLoading(false);
    }
  };

  // Tải dữ liệu Admin
  const fetchAdminData = async () => {
    try {
      setAdminLoading(true);
      const [statsRes, attRes, auditRes] = await Promise.all([
        fetch('/api/admin/overview'),
        fetch('/api/admin/attendees'),
        fetch('/api/admin/audit-logs'),
      ]);

      const stats = await statsRes.json();
      const att = await attRes.json();
      const audit = await auditRes.json();

      if (stats.success) setAdminStats(stats.data);
      if (att.success) setAdminAttendees(att.data);
      if (audit.success) setAdminAuditLogs(audit.data);
    } catch (err) {
      console.error('Lỗi tải dữ liệu quản trị:', err);
    } finally {
      setAdminLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'admin') {
      fetchAdminData();
    }
  }, [activeTab]);

  // Tạo sự kiện mới
  const handleCreateEvent = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newEvent.title,
          description: newEvent.description,
          category: newEvent.category,
          location: newEvent.location,
          banner_url: newEvent.banner_url,
          start_time: newEvent.start_time,
          end_time: newEvent.end_time,
          max_capacity: parseInt(newEvent.max_capacity, 10),
          tickets: [
            {
              name: newEvent.ticket_name,
              tier: 'STANDARD',
              price: parseFloat(newEvent.price),
              quantity_total: parseInt(newEvent.max_capacity, 10),
              description: 'Vé tiêu chuẩn tham dự sự kiện',
            },
          ],
        }),
      });

      const data = await res.json();
      if (data.success) {
        setShowCreateModal(false);
        fetchAdminData();
        fetchEvents();
      } else {
        alert(data.message || 'Tạo sự kiện thất bại');
      }
    } catch (err) {
      alert('Lỗi kết nối khi tạo sự kiện');
    }
  };

  // Lọc sự kiện theo search & category
  const filteredEvents = events.filter((evt) => {
    const matchCategory = selectedCategory === 'all' || evt.category.toLowerCase() === selectedCategory.toLowerCase();
    const matchSearch =
      evt.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      evt.location.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCategory && matchSearch;
  });

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('vi-VN', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div>
      {/* Top Navigation */}
      <nav className="navbar">
        <div className="container nav-container">
          <a href="#" className="brand" onClick={() => setActiveTab('events')}>
            <div className="brand-icon">
              <Ticket size={24} color="#ffffff" />
            </div>
            <span>EVENTIFY 26</span>
          </a>

          <div className="nav-links">
            <button
              className={`nav-btn ${activeTab === 'events' ? 'active' : ''}`}
              onClick={() => setActiveTab('events')}
            >
              <Calendar size={18} /> Khám phá Sự kiện
            </button>
            <button
              className={`nav-btn ${activeTab === 'lookup' ? 'active' : ''}`}
              onClick={() => setActiveTab('lookup')}
            >
              <Search size={18} /> Tra cứu Vé
            </button>
            <button
              className={`nav-btn ${activeTab === 'admin' ? 'active' : ''}`}
              onClick={() => setActiveTab('admin')}
            >
              <LayoutDashboard size={18} /> Quản trị Admin
            </button>
            <a
              href="/metrics"
              target="_blank"
              rel="noreferrer"
              className="nav-btn"
              title="Prometheus Metrics"
            >
              <TrendingUp size={18} /> Metrics
            </a>
          </div>
        </div>
      </nav>

      <main className="container">
        {/* VIEW 1: DISCOVER EVENTS */}
        {activeTab === 'events' && (
          <div>
            <section className="hero">
              <div className="badge-topic">
                <ShieldCheck size={16} /> Đề 26: Hệ thống Quản lý Sự kiện & Vé Thông Minh
              </div>
              <h1 className="hero-title">Khám Phá & Đăng Ký Vé Sự Kiện Trực Tuyến</h1>
              <p className="hero-subtitle">
                Nền tảng tổ chức sự kiện chuyên nghiệp với tính năng đăng ký an toàn chống nghẽn mạng, xác thực Idempotency
                và tra cứu vé tự động với mã QR.
              </p>

              <div className="stats-bar">
                <div className="stat-item">
                  <div className="stat-value">{events.length}</div>
                  <div className="stat-label">Sự kiện đang mở</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">
                    {events.reduce((sum, e) => sum + (e.sold_tickets || 0), 0)}
                  </div>
                  <div className="stat-label">Vé đã được giữ chỗ</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">100%</div>
                  <div className="stat-label">An toàn giao dịch (DB Check)</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">&lt; 15ms</div>
                  <div className="stat-label">Thời gian phản hồi API</div>
                </div>
              </div>
            </section>

            {/* Filter and Search */}
            <div className="filter-bar">
              <div className="search-input-wrapper">
                <Search className="search-icon" size={20} />
                <input
                  type="text"
                  className="search-input"
                  placeholder="Tìm kiếm sự kiện theo tên, địa điểm, từ khóa..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="category-chips">
                {['all', 'Technology', 'Music', 'Sports', 'Business'].map((cat) => (
                  <button
                    key={cat}
                    className={`chip ${selectedCategory === cat ? 'active' : ''}`}
                    onClick={() => setSelectedCategory(cat)}
                  >
                    {cat === 'all' ? 'Tất cả chủ đề' : cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Events Grid */}
            {loadingEvents ? (
              <div style={{ textAlign: 'center', padding: '5rem 0', color: 'var(--text-secondary)' }}>
                <RefreshCw size={36} className="animate-spin" style={{ margin: '0 auto 1rem' }} />
                <p>Đang tải danh sách sự kiện từ máy chủ...</p>
              </div>
            ) : filteredEvents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--text-muted)' }}>
                <p>Không tìm thấy sự kiện nào phù hợp với bộ lọc hiện tại.</p>
              </div>
            ) : (
              <div className="events-grid">
                {filteredEvents.map((evt) => {
                  const percentSold =
                    evt.total_tickets > 0 ? Math.min(100, Math.round((evt.sold_tickets / evt.total_tickets) * 100)) : 0;
                  return (
                    <div key={evt.id} className="event-card">
                      <div className="event-banner-wrap">
                        <img src={evt.banner_url} alt={evt.title} className="event-card-banner" />
                        <span className="event-category-badge">{evt.category}</span>
                      </div>

                      <div className="event-card-body">
                        <h2 className="event-card-title">{evt.title}</h2>
                        <p className="event-card-desc">{evt.description}</p>

                        <div className="event-card-meta">
                          <div className="meta-row">
                            <Clock size={16} /> {formatDate(evt.start_time)}
                          </div>
                          <div className="meta-row">
                            <MapPin size={16} /> {evt.location}
                          </div>
                        </div>

                        <div className="progress-container">
                          <div className="progress-header">
                            <span>Đã đăng ký: {evt.sold_tickets} / {evt.total_tickets} vé</span>
                            <span>{percentSold}%</span>
                          </div>
                          <div className="progress-bar-bg">
                            <div className="progress-bar-fill" style={{ width: `${percentSold}%` }}></div>
                          </div>
                        </div>

                        <div className="event-card-footer">
                          <div>
                            <span className="price-tag">{formatCurrency(evt.min_price)}</span>
                            <span className="price-sub">Giá vé khởi điểm</span>
                          </div>
                          <button className="btn btn-primary" onClick={() => handleOpenRegister(evt)}>
                            Đăng ký vé <ChevronRight size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* VIEW 2: TICKET LOOKUP */}
        {activeTab === 'lookup' && (
          <div style={{ maxWidth: 720, margin: '2rem auto 4rem' }}>
            <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
              <div className="brand-icon" style={{ display: 'inline-flex', marginBottom: '1rem' }}>
                <QrCode size={32} color="#fff" />
              </div>
              <h1 style={{ fontSize: '2.2rem', fontWeight: 800, marginBottom: '0.5rem' }}>Tra Cứu Vé Tham Dự</h1>
              <p style={{ color: 'var(--text-secondary)' }}>
                Nhập Mã vé (dạng EVT-26-XXXXXX) hoặc Số điện thoại bạn đã sử dụng khi đăng ký để kiểm tra trạng thái vé.
              </p>
            </div>

            <form onSubmit={handleLookup} style={{ background: 'var(--bg-card)', padding: '2rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', marginBottom: '2rem' }}>
              <div className="form-group">
                <label className="form-label">Mã vé tham dự (Ticket Code)</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Ví dụ: EVT-26-DEMO01"
                  value={lookupQuery.code}
                  onChange={(e) => setLookupQuery({ ...lookupQuery, code: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Hoặc Số điện thoại người đăng ký</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Ví dụ: 0901234567"
                  value={lookupQuery.phone}
                  onChange={(e) => setLookupQuery({ ...lookupQuery, phone: e.target.value })}
                />
              </div>

              {lookupError && (
                <div style={{ padding: '0.75rem 1rem', background: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.3)', borderRadius: 'var(--radius-sm)', color: '#fda4af', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <AlertCircle size={18} /> {lookupError}
                </div>
              )}

              <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={lookupLoading}>
                {lookupLoading ? <RefreshCw className="animate-spin" size={18} /> : <Search size={18} />} Tra cứu vé ngay
              </button>
            </form>

            {/* Results Card */}
            {lookupResults && lookupResults.length > 0 && (
              <div>
                <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: '#a5b4fc' }}>
                  Tìm thấy {lookupResults.length} vé hợp lệ:
                </h3>
                {lookupResults.map((t) => (
                  <div key={t.id} className="ticket-pass" style={{ marginBottom: '1.5rem' }}>
                    <div className="ticket-pass-header">
                      <div>
                        <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.9 }}>
                          VÉ THAM DỰ SỰ KIỆN CHÍNH THỨC
                        </span>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: '0.2rem' }}>{t.event_title}</h3>
                      </div>
                      <span className={`status-badge ${t.status}`}>
                        <CheckCircle2 size={14} /> {t.status === 'confirmed' ? 'ĐÃ XÁC NHẬN' : t.status.toUpperCase()}
                      </span>
                    </div>

                    <div className="ticket-pass-body">
                      <div>
                        <div style={{ marginBottom: '1rem' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>MÃ VÉ ĐIỆN TỬ</span>
                          <div>
                            <span className="ticket-code-badge">{t.ticket_code}</span>
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                          <div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>HỌ VÀ TÊN</span>
                            <div style={{ fontWeight: 600 }}>{t.full_name}</div>
                          </div>
                          <div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>SỐ ĐIỆN THOẠI</span>
                            <div style={{ fontWeight: 600 }}>{t.phone}</div>
                          </div>
                          <div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>HẠNG VÉ</span>
                            <div style={{ fontWeight: 600, color: '#38bdf8' }}>{t.ticket_name} ({t.ticket_tier})</div>
                          </div>
                          <div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>GIÁ VÉ</span>
                            <div style={{ fontWeight: 600 }}>{formatCurrency(t.ticket_price)}</div>
                          </div>
                        </div>

                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          <MapPin size={14} style={{ display: 'inline', marginRight: 4 }} /> {t.event_location}
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#ffffff', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                        {/* Simulation QR Code Box */}
                        <div style={{ width: 110, height: 110, background: '#111827', padding: '8px', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <QrCode size={94} color="#ffffff" />
                        </div>
                        <span style={{ fontSize: '0.7rem', color: '#111827', fontWeight: 700, marginTop: '0.5rem', textAlign: 'center' }}>
                          QUÉT ĐỂ CHECK-IN
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* VIEW 3: ADMIN DASHBOARD */}
        {activeTab === 'admin' && (
          <div style={{ margin: '2rem 0 4rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h1 style={{ fontSize: '2rem', fontWeight: 800 }}>Bảng Điều Khiển Quản Trị (Admin)</h1>
                <p style={{ color: 'var(--text-secondary)' }}>
                  Theo dõi số liệu bán vé, danh sách người tham dự và kiểm tra nhật ký an ninh audit logs.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn btn-outline" onClick={fetchAdminData} disabled={adminLoading}>
                  <RefreshCw size={16} className={adminLoading ? 'animate-spin' : ''} /> Làm mới
                </button>
                <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
                  <PlusCircle size={16} /> Thêm sự kiện mới
                </button>
              </div>
            </div>

            {/* KPI Cards */}
            {adminStats && (
              <div className="stats-bar" style={{ marginBottom: '2.5rem' }}>
                <div className="stat-item">
                  <div className="stat-value">{adminStats.total_events}</div>
                  <div className="stat-label">Tổng số sự kiện</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value" style={{ color: '#38bdf8' }}>{adminStats.total_tickets_sold}</div>
                  <div className="stat-label">Tổng vé đã bán</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value" style={{ color: '#34d399' }}>{adminStats.total_attendees}</div>
                  <div className="stat-label">Người tham dự xác nhận</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value" style={{ color: '#fbbf24' }}>{formatCurrency(adminStats.estimated_revenue)}</div>
                  <div className="stat-label">Doanh thu tạm tính</div>
                </div>
              </div>
            )}

            {/* Attendees Table */}
            <div style={{ marginBottom: '3rem' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Users size={20} color="#818cf8" /> Danh Sách Người Tham Dự Mới Nhất
              </h3>

              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Mã vé</th>
                      <th>Người tham dự</th>
                      <th>Số điện thoại & Email</th>
                      <th>Sự kiện</th>
                      <th>Hạng vé</th>
                      <th>Trạng thái</th>
                      <th>Thời gian đăng ký</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminAttendees.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                          Chưa có dữ liệu người đăng ký
                        </td>
                      </tr>
                    ) : (
                      adminAttendees.map((att) => (
                        <tr key={att.id}>
                          <td>
                            <code style={{ background: 'rgba(255,255,255,0.06)', padding: '0.2rem 0.5rem', borderRadius: 4, color: '#a5b4fc', fontWeight: 700 }}>
                              {att.ticket_code}
                            </code>
                          </td>
                          <td style={{ fontWeight: 600 }}>{att.full_name}</td>
                          <td>
                            <div>{att.phone}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{att.email}</div>
                          </td>
                          <td>{att.event_title}</td>
                          <td>
                            <span style={{ color: '#38bdf8', fontWeight: 600 }}>{att.ticket_name}</span>
                          </td>
                          <td>
                            <span className={`status-badge ${att.status}`}>
                              <CheckCircle2 size={12} /> {att.status}
                            </span>
                          </td>
                          <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{formatDate(att.created_at)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Audit Logs Table */}
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldCheck size={20} color="#34d399" /> Nhật Ký Kiểm Tra Hệ Thống (Audit Logs)
              </h3>

              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Hành động (Action)</th>
                      <th>Thực thể (Entity)</th>
                      <th>Tác nhân (Actor)</th>
                      <th>IP & Dữ liệu ghi nhận</th>
                      <th>Thời gian</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminAuditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                          Chưa có nhật ký audit log
                        </td>
                      </tr>
                    ) : (
                      adminAuditLogs.map((log) => (
                        <tr key={log.id}>
                          <td>
                            <span style={{ fontWeight: 700, color: '#f59e0b', fontSize: '0.85rem' }}>{log.action}</span>
                          </td>
                          <td>{log.entity}</td>
                          <td>{log.actor}</td>
                          <td>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: 350, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              IP: {log.ip_address || 'local'} | {JSON.stringify(log.payload)}
                            </div>
                          </td>
                          <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{formatDate(log.created_at)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* MODAL: EVENT DETAIL & REGISTRATION */}
      {selectedEvent && (
        <div className="modal-overlay" onClick={() => setSelectedEvent(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Đăng Ký Tham Dự Sự Kiện</h3>
              <button className="modal-close" onClick={() => setSelectedEvent(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              {/* Event preview */}
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', alignItems: 'center' }}>
                <img
                  src={selectedEvent.banner_url}
                  alt={selectedEvent.title}
                  style={{ width: 80, height: 80, borderRadius: 'var(--radius-md)', objectFit: 'cover' }}
                />
                <div>
                  <h4 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.25rem' }}>{selectedEvent.title}</h4>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    <MapPin size={14} style={{ display: 'inline' }} /> {selectedEvent.location}
                  </div>
                </div>
              </div>

              {registrationResult ? (
                /* SUCCESS STATE: SHOW TICKET PASS */
                <div>
                  <div style={{ padding: '1rem', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 'var(--radius-md)', textAlign: 'center', marginBottom: '1.5rem' }}>
                    <CheckCircle2 size={36} color="#34d399" style={{ margin: '0 auto 0.5rem' }} />
                    <h4 style={{ color: '#34d399', fontWeight: 800, fontSize: '1.1rem' }}>Chúc mừng! Bạn đã đăng ký vé thành công!</h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      Mã vé đã được phát hành và lưu trữ an toàn trong cơ sở dữ liệu.
                    </p>
                  </div>

                  <div className="ticket-pass" style={{ marginTop: 0 }}>
                    <div className="ticket-pass-header">
                      <div>
                        <span style={{ fontSize: '0.75rem', textTransform: 'uppercase' }}>VÉ XÁC NHẬN</span>
                        <h4 style={{ fontWeight: 800 }}>{registrationResult.event_title}</h4>
                      </div>
                      <span className="status-badge confirmed">ĐÃ XÁC NHẬN</span>
                    </div>

                    <div className="ticket-pass-body">
                      <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>MÃ VÉ ĐIỆN TỬ</span>
                        <div style={{ margin: '0.3rem 0 1rem' }}>
                          <span className="ticket-code-badge">{registrationResult.ticket_code}</span>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          <strong>Người nhận:</strong> {registrationResult.full_name} <br />
                          <strong>Hạng vé:</strong> {registrationResult.ticket_name} <br />
                          <strong>Giá vé:</strong> {formatCurrency(registrationResult.ticket_price)}
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#fff', borderRadius: 'var(--radius-md)', padding: '0.5rem' }}>
                        <QrCode size={80} color="#111827" />
                        <span style={{ fontSize: '0.65rem', color: '#111827', fontWeight: 700, marginTop: '0.2rem' }}>
                          VÉ HỢP LỆ
                        </span>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem' }}>
                    <button
                      className="btn btn-outline"
                      style={{ flex: 1 }}
                      onClick={() => {
                        navigator.clipboard.writeText(registrationResult.ticket_code);
                        alert('Đã sao chép mã vé vào clipboard!');
                      }}
                    >
                      <Copy size={16} /> Sao chép mã vé
                    </button>
                    <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setSelectedEvent(null)}>
                      Hoàn tất
                    </button>
                  </div>
                </div>
              ) : (
                /* REGISTRATION FORM */
                <form onSubmit={handleSubmitRegistration}>
                  <div style={{ marginBottom: '1.25rem' }}>
                    <label className="form-label">Chọn Hạng Vé:</label>
                    <div className="tier-list">
                      {selectedEvent.tickets &&
                        selectedEvent.tickets.map((t) => {
                          const isSoldOut = t.quantity_remaining <= 0;
                          const isSelected = selectedTier?.id === t.id;
                          return (
                            <div
                              key={t.id}
                              className={`tier-option ${isSelected ? 'selected' : ''} ${isSoldOut ? 'sold-out' : ''}`}
                              onClick={() => !isSoldOut && setSelectedTier(t)}
                            >
                              <div>
                                <div style={{ fontWeight: 700, color: '#fff' }}>{t.name}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                  {t.description || 'Bao gồm quyền tham dự sự kiện'}
                                </div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontWeight: 800, color: '#38bdf8' }}>{formatCurrency(t.price)}</div>
                                <div style={{ fontSize: '0.75rem', color: isSoldOut ? 'var(--accent-rose)' : 'var(--text-muted)' }}>
                                  {isSoldOut ? 'HẾT VÉ' : `Còn ${t.quantity_remaining} vé`}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Họ và Tên (*)</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Nguyễn Văn A"
                      required
                      value={registerForm.full_name}
                      onChange={(e) => setRegisterForm({ ...registerForm, full_name: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Địa Chỉ Email (*)</label>
                    <input
                      type="email"
                      className="form-control"
                      placeholder="nguyenvana@gmail.com"
                      required
                      value={registerForm.email}
                      onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Số Điện Thoại (*)</label>
                    <input
                      type="tel"
                      className="form-control"
                      placeholder="0912345678"
                      required
                      value={registerForm.phone}
                      onChange={(e) => setRegisterForm({ ...registerForm, phone: e.target.value })}
                    />
                    <small style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Mỗi số điện thoại chỉ được đăng ký 1 vé cho mỗi sự kiện (chống spam).
                    </small>
                  </div>

                  <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1.25rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    <span>Khóa Idempotency an toàn: </span>
                    <code style={{ color: '#a5b4fc' }}>{registerForm.idempotencyKey}</code>
                  </div>

                  {registrationError && (
                    <div style={{ padding: '0.75rem 1rem', background: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.3)', borderRadius: 'var(--radius-sm)', color: '#fda4af', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <AlertCircle size={18} /> {registrationError}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ width: '100%', padding: '0.85rem' }}
                    disabled={isSubmitting || !selectedTier || selectedTier.quantity_remaining <= 0}
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="animate-spin" size={18} /> Đang xử lý giao dịch...
                      </>
                    ) : (
                      <>
                        <CreditCard size={18} /> Xác Nhận Đăng Ký (
                        {selectedTier ? formatCurrency(selectedTier.price) : '0 đ'})
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADMIN CREATE EVENT */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Tạo Sự Kiện Mới</h3>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <form onSubmit={handleCreateEvent}>
                <div className="form-group">
                  <label className="form-label">Tên Sự Kiện (*)</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    value={newEvent.title}
                    onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Chủ đề / Thể loại</label>
                  <select
                    className="form-control"
                    value={newEvent.category}
                    onChange={(e) => setNewEvent({ ...newEvent, category: e.target.value })}
                  >
                    <option value="Technology">Technology (Công nghệ)</option>
                    <option value="Music">Music (Âm nhạc)</option>
                    <option value="Sports">Sports (Thể thao)</option>
                    <option value="Business">Business (Kinh doanh)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Địa Điểm Tổ Chức (*)</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    value={newEvent.location}
                    onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">Thời Gian Bắt Đầu (*)</label>
                    <input
                      type="datetime-local"
                      className="form-control"
                      required
                      value={newEvent.start_time}
                      onChange={(e) => setNewEvent({ ...newEvent, start_time: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Thời Gian Kết Thúc (*)</label>
                    <input
                      type="datetime-local"
                      className="form-control"
                      required
                      value={newEvent.end_time}
                      onChange={(e) => setNewEvent({ ...newEvent, end_time: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">Sức Chứa / Số Vé (*)</label>
                    <input
                      type="number"
                      className="form-control"
                      min={1}
                      required
                      value={newEvent.max_capacity}
                      onChange={(e) => setNewEvent({ ...newEvent, max_capacity: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Giá Vé (VND)</label>
                    <input
                      type="number"
                      className="form-control"
                      min={0}
                      step={1000}
                      value={newEvent.price}
                      onChange={(e) => setNewEvent({ ...newEvent, price: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Ảnh Banner (URL)</label>
                  <input
                    type="url"
                    className="form-control"
                    value={newEvent.banner_url}
                    onChange={(e) => setNewEvent({ ...newEvent, banner_url: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Mô Tả Chi Tiết (*)</label>
                  <textarea
                    rows={3}
                    className="form-control"
                    required
                    value={newEvent.description}
                    onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                  ></textarea>
                </div>

                <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }}>
                  Tạo sự kiện ngay
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="footer">
        <div className="container footer-content">
          <div>
            <div style={{ fontWeight: 800, color: '#fff', fontSize: '1.1rem', marginBottom: '0.25rem' }}>
              EVENTIFY 26
            </div>
            <p>Hệ thống Quản lý Sự kiện / Event (Website tổ chức sự kiện, đăng ký tham dự, vé)</p>
            <p style={{ marginTop: '0.25rem', color: '#64748b' }}>
              Kiến trúc chuẩn Microservices: Nginx Unprivileged + PostgreSQL 17 + Express TypeScript + React Vite
            </p>
          </div>

          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: '#34d399' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#34d399', display: 'inline-block' }}></span>
              Hệ thống hoạt động bình thường
            </span>
            <a href="/pgadmin/" target="_blank" rel="noreferrer" className="btn btn-outline" style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}>
              pgAdmin 4 <ExternalLink size={14} />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
