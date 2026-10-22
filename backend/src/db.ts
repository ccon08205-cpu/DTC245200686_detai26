import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Sử dụng APP_DB_USER theo nguyên tắc Quyền tối thiểu (Least Privilege)
const user = process.env.APP_DB_USER || process.env.POSTGRES_USER || 'postgres';
const password = process.env.APP_DB_PASSWORD || process.env.POSTGRES_PASSWORD || 'postgres';
const host = process.env.POSTGRES_HOST || 'postgres';
const port = parseInt(process.env.POSTGRES_PORT || '5432', 10);
const database = process.env.POSTGRES_DB || 'eventdb';

export const pool = new Pool({
  host,
  port,
  database,
  user,
  password,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[PostgreSQL Pool Error]:', err);
});

export const query = (text: string, params?: any[]) => pool.query(text, params);
