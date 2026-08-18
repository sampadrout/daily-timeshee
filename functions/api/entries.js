import { json, toISODate, rowToEntry, normalizeEntry } from '../_shared.js';

const RETENTION_DAYS = 90;

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;
  if (!db) return json({ error: 'Database is not configured' }, 500);

  if (request.method === 'GET') {
    // Enforce the 90-day retention window on every read.
    const now = new Date();
    now.setUTCDate(now.getUTCDate() - RETENTION_DAYS);
    const cutoff = toISODate(now);
    await db.prepare('DELETE FROM entries WHERE date < ?').bind(cutoff).run();

    const { results } = await db
      .prepare('SELECT * FROM entries ORDER BY date DESC, created_at DESC')
      .all();
    return json({ cutoff, entries: results.map(rowToEntry) });
  }

  if (request.method === 'POST') {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Body must be valid JSON' }, 400);
    }
    const { entry, error } = normalizeEntry(body);
    if (error) return json({ error }, 400);

    await db
      .prepare(
        'INSERT INTO entries (id, date, task, description, hours, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(entry.id, entry.date, entry.task, entry.description, entry.hours, entry.createdAt)
      .run();
    return json({ entry }, 201);
  }

  return json({ error: 'Method not allowed' }, 405);
}
