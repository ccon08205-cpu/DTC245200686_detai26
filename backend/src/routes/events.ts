import { Router, Request, Response } from 'express';
import { query } from '../db';

export const eventsRouter = Router();

// GET /api/events - Danh sách các sự kiện
eventsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { category, search, status } = req.query;
    let sql = `
      SELECT 
        e.id, e.title, e.slug, e.description, e.category, e.location,
        e.banner_url, e.start_time, e.end_time, e.status, e.max_capacity,
        e.organizer_name, e.created_at,
        COALESCE(SUM(t.quantity_total), 0)::int AS total_tickets,
        COALESCE(SUM(t.quantity_sold), 0)::int AS sold_tickets,
        MIN(t.price) AS min_price,
        MAX(t.price) AS max_price
      FROM events e
      LEFT JOIN tickets t ON e.id = t.event_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (category && typeof category === 'string' && category !== 'all') {
      params.push(category);
      sql += ` AND e.category = $${params.length}`;
    }

    if (status && typeof status === 'string') {
      params.push(status);
      sql += ` AND e.status = $${params.length}`;
    } else {
      sql += ` AND e.status IN ('published', 'ongoing')`;
    }

    if (search && typeof search === 'string') {
      params.push(`%${search}%`);
      sql += ` AND (e.title ILIKE $${params.length} OR e.location ILIKE $${params.length} OR e.description ILIKE $${params.length})`;
    }

    sql += ` GROUP BY e.id ORDER BY e.start_time ASC`;

    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    console.error('Error fetching events:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy danh sách sự kiện', error: err.message });
  }
});

// GET /api/events/:id - Chi tiết sự kiện kèm danh sách các loại vé
eventsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Lấy thông tin sự kiện
    const eventResult = await query(
      `SELECT * FROM events WHERE id = $1 OR slug = $1`,
      [id]
    );

    if (eventResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sự kiện' });
    }

    const event = eventResult.rows[0];

    // Lấy danh sách các loại vé của sự kiện
    const ticketsResult = await query(
      `SELECT 
        id, event_id, name, tier, price, quantity_total, quantity_sold,
        (quantity_total - quantity_sold) AS quantity_remaining,
        description
      FROM tickets
      WHERE event_id = $1
      ORDER BY price ASC`,
      [event.id]
    );

    res.json({
      success: true,
      data: {
        ...event,
        tickets: ticketsResult.rows,
      },
    });
  } catch (err: any) {
    console.error('Error fetching event details:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy chi tiết sự kiện', error: err.message });
  }
});
