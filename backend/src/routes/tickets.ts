import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { pool } from '../db';
import { ticketRegistrationCounter, activeAttendeesGauge } from '../metrics';

export const ticketsRouter = Router();

// Hàm tạo mã vé độc nhất dạng EVT-26-XXXXXX
function generateTicketCode(): string {
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `EVT-26-${random}`;
}

// POST /api/tickets/register - Đăng ký vé tham dự sự kiện (Hỗ trợ Idempotency)
ticketsRouter.post('/register', async (req: Request, res: Response) => {
  const client = await pool.connect();
  const idempotencyKey = (req.header('Idempotency-Key') || req.body.idempotency_key || '').trim();

  try {
    const { event_id, ticket_id, full_name, email, phone } = req.body;

    // Validate dữ liệu đầu vào
    if (!event_id || !ticket_id || !full_name || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp đầy đủ thông tin: event_id, ticket_id, full_name, email, phone',
      });
    }

    if (!idempotencyKey) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu Idempotency-Key trong header hoặc body để đảm bảo an toàn giao dịch.',
      });
    }

    // 1. KIỂM TRA IDEMPOTENCY: Nếu request đã từng thực thi thành công, trả về kết quả cũ
    const existingAttendee = await client.query(
      `SELECT a.*, e.title as event_title, e.location as event_location, e.start_time as event_start_time,
              t.name as ticket_name, t.price as ticket_price, t.tier as ticket_tier
       FROM attendees a
       JOIN events e ON a.event_id = e.id
       JOIN tickets t ON a.ticket_id = t.id
       WHERE a.idempotency_key = $1`,
      [idempotencyKey]
    );

    if (existingAttendee.rows.length > 0) {
      return res.status(200).json({
        success: true,
        message: 'Giao dịch đã được ghi nhận trước đó (Idempotent replay)',
        is_replay: true,
        data: existingAttendee.rows[0],
      });
    }

    // 2. KIỂM TRA SỐ ĐIỆN THOẠI ĐÃ ĐĂNG KÝ SỰ KIỆN CHƯA
    const phoneCheck = await client.query(
      `SELECT id, ticket_code FROM attendees WHERE event_id = $1 AND phone = $2`,
      [event_id, phone]
    );

    if (phoneCheck.rows.length > 0) {
      ticketRegistrationCounter.inc({ status: 'failed_duplicate_phone', tier: 'UNKNOWN' });
      return res.status(409).json({
        success: false,
        message: `Số điện thoại ${phone} đã đăng ký vé cho sự kiện này (Mã vé: ${phoneCheck.rows[0].ticket_code}). Mỗi số điện thoại chỉ được đăng ký 1 vé.`,
      });
    }

    // BẮT ĐẦU TRANSACTION CÓ ROW-LEVEL LOCKING
    await client.query('BEGIN');

    // 3. KHÓA DÒNG BẢN GHI VÉ (SELECT ... FOR UPDATE) ĐỂ CHỐNG RACE CONDITION OVERSOLD
    const ticketCheck = await client.query(
      `SELECT id, event_id, name, tier, price, quantity_total, quantity_sold
       FROM tickets
       WHERE id = $1 AND event_id = $2
       FOR UPDATE`,
      [ticket_id, event_id]
    );

    if (ticketCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Loại vé không tồn tại hoặc không thuộc sự kiện này' });
    }

    const ticket = ticketCheck.rows[0];

    // Kiểm tra số lượng vé còn lại
    if (ticket.quantity_sold >= ticket.quantity_total) {
      await client.query('ROLLBACK');
      ticketRegistrationCounter.inc({ status: 'sold_out', tier: ticket.tier });
      return res.status(400).json({
        success: false,
        message: `Hạng vé '${ticket.name}' đã hết vé. Vui lòng chọn hạng vé khác!`,
      });
    }

    // 4. CẬP NHẬT TĂNG SỐ LƯỢNG VÉ ĐÃ BÁN (DB Constraint chk_no_oversell là lá chắn thứ 2)
    await client.query(
      `UPDATE tickets 
       SET quantity_sold = quantity_sold + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [ticket_id]
    );

    // 5. TẠO BẢN GHI NGƯỜI THAM DỰ (ATTENDEE)
    const ticketCode = generateTicketCode();
    const attendeeResult = await client.query(
      `INSERT INTO attendees (event_id, ticket_id, ticket_code, full_name, email, phone, status, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6, 'confirmed', $7)
       RETURNING *`,
      [event_id, ticket_id, ticketCode, full_name, email, phone, idempotencyKey]
    );

    const attendee = attendeeResult.rows[0];

    // 6. GHI NHẬT KÝ AUDIT LOG
    await client.query(
      `INSERT INTO audit_logs (action, entity, entity_id, actor, payload, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        'REGISTER_TICKET',
        'attendees',
        attendee.id,
        email,
        JSON.stringify({ ticket_code: ticketCode, ticket_name: ticket.name, price: ticket.price, phone }),
        req.ip || req.socket.remoteAddress || 'unknown',
        req.headers['user-agent'] || 'unknown',
      ]
    );

    // COMMIT TOÀN BỘ GIAO DỊCH
    await client.query('COMMIT');

    // Cập nhật Metrics Prometheus
    ticketRegistrationCounter.inc({ status: 'success', tier: ticket.tier });
    activeAttendeesGauge.inc();

    // Lấy thông tin đầy đủ trả về cho Client
    const eventResult = await pool.query(`SELECT title, location, start_time FROM events WHERE id = $1`, [event_id]);
    const eventInfo = eventResult.rows[0] || {};

    res.status(201).json({
      success: true,
      message: 'Đăng ký vé thành công!',
      data: {
        ...attendee,
        event_title: eventInfo.title,
        event_location: eventInfo.location,
        event_start_time: eventInfo.start_time,
        ticket_name: ticket.name,
        ticket_price: ticket.price,
        ticket_tier: ticket.tier,
      },
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Error during ticket registration:', err);

    // Xử lý mã lỗi PostgreSQL (23505 = Unique Violation, 23514 = Check Violation)
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'Đăng ký bị trùng lặp (trùng mã Idempotency, mã vé hoặc số điện thoại)',
        detail: err.detail,
      });
    }

    if (err.code === '23514') {
      return res.status(400).json({
        success: false,
        message: 'Số lượng vé vượt quá giới hạn tối đa cho phép của hệ thống!',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Có lỗi xảy ra trong quá trình đăng ký vé',
      error: err.message,
    });
  } finally {
    client.release();
  }
});

// GET /api/tickets/lookup - Tra cứu vé theo mã vé và số điện thoại
ticketsRouter.get('/lookup', async (req: Request, res: Response) => {
  try {
    const { code, phone } = req.query;

    if (!code && !phone) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp mã vé (code) hoặc số điện thoại (phone) để tra cứu',
      });
    }

    let sql = `
      SELECT 
        a.id, a.ticket_code, a.full_name, a.email, a.phone, a.status, a.check_in_at, a.created_at,
        e.id as event_id, e.title as event_title, e.location as event_location, 
        e.start_time as event_start_time, e.end_time as event_end_time, e.banner_url,
        t.name as ticket_name, t.tier as ticket_tier, t.price as ticket_price
      FROM attendees a
      JOIN events e ON a.event_id = e.id
      JOIN tickets t ON a.ticket_id = t.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (code && typeof code === 'string') {
      params.push(code.trim().toUpperCase());
      sql += ` AND UPPER(a.ticket_code) = $${params.length}`;
    }

    if (phone && typeof phone === 'string') {
      params.push(phone.trim());
      sql += ` AND a.phone = $${params.length}`;
    }

    sql += ` ORDER BY a.created_at DESC`;

    const result = await pool.query(sql, params);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy thông tin vé phù hợp với mã vé hoặc số điện thoại đã nhập',
      });
    }

    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (err: any) {
    console.error('Error looking up ticket:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi tra cứu vé', error: err.message });
  }
});
