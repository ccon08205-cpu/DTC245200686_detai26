import { Router, Request, Response } from 'express';
import { pool, query } from '../db';

export const adminRouter = Router();

// GET /api/admin/overview - Thống kê tổng quan hệ thống
adminRouter.get('/overview', async (_req: Request, res: Response) => {
  try {
    const statsQuery = `
      SELECT 
        (SELECT COUNT(*) FROM events)::int as total_events,
        (SELECT COUNT(*) FROM events WHERE status = 'published')::int as active_events,
        (SELECT COUNT(*) FROM attendees WHERE status = 'confirmed')::int as total_attendees,
        (SELECT COALESCE(SUM(quantity_sold), 0) FROM tickets)::int as total_tickets_sold,
        (SELECT COALESCE(SUM(t.quantity_sold * t.price), 0) FROM tickets t)::numeric as estimated_revenue
    `;

    const statsResult = await query(statsQuery);
    res.json({ success: true, data: statsResult.rows[0] });
  } catch (err: any) {
    console.error('Error fetching admin overview:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy thống kê tổng quan', error: err.message });
  }
});

// GET /api/admin/attendees - Danh sách người tham gia
adminRouter.get('/attendees', async (req: Request, res: Response) => {
  try {
    const { event_id, search, limit = 50 } = req.query;

    let sql = `
      SELECT 
        a.id, a.ticket_code, a.full_name, a.email, a.phone, a.status, a.check_in_at, a.created_at,
        e.title as event_title, e.location as event_location,
        t.name as ticket_name, t.tier as ticket_tier, t.price as ticket_price
      FROM attendees a
      JOIN events e ON a.event_id = e.id
      JOIN tickets t ON a.ticket_id = t.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (event_id && typeof event_id === 'string') {
      params.push(event_id);
      sql += ` AND a.event_id = $${params.length}`;
    }

    if (search && typeof search === 'string') {
      params.push(`%${search}%`);
      sql += ` AND (a.full_name ILIKE $${params.length} OR a.email ILIKE $${params.length} OR a.phone ILIKE $${params.length} OR a.ticket_code ILIKE $${params.length})`;
    }

    params.push(parseInt(limit as string, 10) || 50);
    sql += ` ORDER BY a.created_at DESC LIMIT $${params.length}`;

    const result = await query(sql, params);
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (err: any) {
    console.error('Error fetching admin attendees:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy danh sách người tham dự', error: err.message });
  }
});

// POST /api/admin/events - Tạo sự kiện mới kèm các hạng vé
adminRouter.post('/events', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const {
      title,
      description,
      category = 'Technology',
      location,
      banner_url,
      start_time,
      end_time,
      max_capacity,
      organizer_name = 'Ban Tổ Chức Đề 26',
      tickets = [],
    } = req.body;

    if (!title || !description || !location || !start_time || !end_time || !max_capacity) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp đầy đủ thông tin sự kiện bắt buộc.' });
    }

    const slug = title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[đĐ]/g, 'd')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '') + '-' + Date.now().toString(36);

    await client.query('BEGIN');

    const eventResult = await client.query(
      `INSERT INTO events (title, slug, description, category, location, banner_url, start_time, end_time, max_capacity, organizer_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [title, slug, description, category, location, banner_url || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87', start_time, end_time, max_capacity, organizer_name]
    );

    const createdEvent = eventResult.rows[0];

    // Thêm các hạng vé nếu có
    const createdTickets = [];
    if (Array.isArray(tickets) && tickets.length > 0) {
      for (const t of tickets) {
        const ticketRes = await client.query(
          `INSERT INTO tickets (event_id, name, tier, price, quantity_total, description)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [createdEvent.id, t.name, t.tier || 'STANDARD', t.price, t.quantity_total, t.description || '']
        );
        createdTickets.push(ticketRes.rows[0]);
      }
    } else {
      // Mặc định tạo 1 vé tiêu chuẩn nếu không truyền mảng vé
      const defaultTicket = await client.query(
        `INSERT INTO tickets (event_id, name, tier, price, quantity_total, description)
         VALUES ($1, 'Vé Tiêu Chuẩn', 'STANDARD', 0, $2, 'Vé vào cổng tiêu chuẩn')
         RETURNING *`,
        [createdEvent.id, max_capacity]
      );
      createdTickets.push(defaultTicket.rows[0]);
    }

    // Ghi audit log
    await client.query(
      `INSERT INTO audit_logs (action, entity, entity_id, actor, payload)
       VALUES ('CREATE_EVENT', 'events', $1, 'admin', $2)`,
      [createdEvent.id, JSON.stringify({ title, slug, tickets_count: createdTickets.length })]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Tạo sự kiện mới thành công!',
      data: {
        ...createdEvent,
        tickets: createdTickets,
      },
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Error creating event:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi tạo sự kiện', error: err.message });
  } finally {
    client.release();
  }
});

// GET /api/admin/audit-logs - Nhật ký hệ thống
adminRouter.get('/audit-logs', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const result = await query(
      `SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (err: any) {
    console.error('Error fetching audit logs:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy audit logs', error: err.message });
  }
});
