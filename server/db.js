import pg from 'pg';
import { readFile } from 'node:fs/promises';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ Thiếu biến môi trường DATABASE_URL (vd: postgresql://user:pass@host:5432/dbname)');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString,
  max: 10,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

/** Chạy 1 câu SQL có tham số, trả về mảng dòng */
export async function q(text, params) {
  const res = await pool.query(text, params);
  return res.rows;
}

/** Tạo bảng (nếu chưa có). Thử lại vài lần vì database có thể khởi động chậm hơn app. */
export async function initDb() {
  const sql = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  for (let i = 1; ; i++) {
    try {
      await pool.query(sql);
      return;
    } catch (e) {
      if (i >= 15) throw e;
      console.log(`⏳ Chưa kết nối được database (lần ${i}): ${e.message} — thử lại sau 3 giây…`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}
