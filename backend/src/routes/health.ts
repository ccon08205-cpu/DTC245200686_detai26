import { Router, Request, Response } from 'express';
import { query } from '../db';

export const healthRouter = Router();

healthRouter.get('/', async (_req: Request, res: Response) => {
  const startTime = Date.now();
  let dbStatus = 'healthy';
  let dbLatencyMs = 0;

  try {
    const dbStart = Date.now();
    await query('SELECT 1');
    dbLatencyMs = Date.now() - dbStart;
  } catch (err: any) {
    dbStatus = `unhealthy: ${err.message}`;
  }

  const isHealthy = dbStatus === 'healthy';
  const statusCode = isHealthy ? 200 : 503;

  res.status(statusCode).json({
    status: isHealthy ? 'UP' : 'DOWN',
    timestamp: new Date().toISOString(),
    uptime_seconds: process.uptime(),
    checks: {
      database: {
        status: dbStatus,
        latency_ms: dbLatencyMs,
      },
    },
    service: 'eventify-backend',
    version: '1.0.0',
    total_response_time_ms: Date.now() - startTime,
  });
});
