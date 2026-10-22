import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { register, httpRequestCounter, httpRequestDurationHistogram } from './metrics';
import { eventsRouter } from './routes/events';
import { ticketsRouter } from './routes/tickets';
import { adminRouter } from './routes/admin';
import { healthRouter } from './routes/health';
import { pool } from './db';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Bảo mật HTTP Headers
app.use(helmet());

// Cross-Origin Resource Sharing
const allowedOrigins = (process.env.CORS_ORIGIN || '*').split(',');
app.use(
  cors({
    origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware giám sát HTTP Metrics cho Prometheus
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = process.hrtime();

  res.on('finish', () => {
    const diff = process.hrtime(start);
    const durationSeconds = diff[0] + diff[1] / 1e9;
    const route = req.baseUrl + (req.route ? req.route.path : req.path);

    httpRequestCounter.inc({
      method: req.method,
      route,
      status_code: res.statusCode.toString(),
    });

    httpRequestDurationHistogram.observe(
      {
        method: req.method,
        route,
        status_code: res.statusCode.toString(),
      },
      durationSeconds
    );
  });

  next();
});

// Endpoint xuất Metrics chuẩn Prometheus
app.get('/metrics', async (_req: Request, res: Response) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err: any) {
    res.status(500).end(err.message);
  }
});

// Health check endpoint
app.use('/health', healthRouter);

// REST API Routes
app.use('/api/events', eventsRouter);
app.use('/api/tickets', ticketsRouter);
app.use('/api/admin', adminRouter);

// Root info
app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'Event Management API - Đề 26',
    status: 'running',
    version: '1.0.0',
    documentation: {
      health: '/health',
      metrics: '/metrics',
      events: '/api/events',
      register_ticket: 'POST /api/tickets/register (requires Idempotency-Key)',
      lookup_ticket: 'GET /api/tickets/lookup?code=...&phone=...',
      admin: '/api/admin/overview',
    },
  });
});

// 404 Handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, message: 'Endpoint không tồn tại' });
});

// Global Error Handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Unhandled Error]:', err);
  res.status(500).json({
    success: false,
    message: 'Lỗi nội bộ máy chủ',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Khởi chạy Server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 [Backend] Eventify API service đang lắng nghe tại cổng ${PORT}`);
  console.log(`📊 [Metrics] Prometheus metrics sẵn sàng tại http://0.0.0.0:${PORT}/metrics`);
});

// Graceful Shutdown
const gracefulShutdown = (signal: string) => {
  console.log(`\n🛑 Nhận tín hiệu ${signal}. Đang tắt dịch vụ an toàn...`);
  server.close(async () => {
    console.log('🔌 Đóng HTTP Server.');
    try {
      await pool.end();
      console.log('💾 Đóng kết nối PostgreSQL Pool thành công.');
      process.exit(0);
    } catch (err) {
      console.error('Lỗi khi đóng database pool:', err);
      process.exit(1);
    }
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
