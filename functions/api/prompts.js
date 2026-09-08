import { json } from '../_shared.js';

export async function onRequest(context) {
  const { request, env, url } = context;
  const db = env.DB;
  if (!db) return json({ error: 'Database is not configured' }, 500);

  if (request.method === 'GET') {
    const type = url.searchParams.get('type');
    if (!type || !['task', 'unit', 'name'].includes(type)) {
      return json({ error: 'Missing or invalid type query parameter' }, 400);
    }
    const { results } = await db.prepare('SELECT value FROM prompts WHERE type = ? ORDER BY value').bind(type).all();
    return json({ prompts: results.map((r) => r.value) });
  }

  if (request.method === 'POST') {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Body must be valid JSON' }, 400);
    }
    const type = body?.type;
    const value = typeof body?.value === 'string' ? body.value.trim() : '';
    if (!type || !['task', 'unit', 'name'].includes(type)) return json({ error: 'Invalid type' }, 400);
    if (!value) return json({ error: 'Prompt value is required' }, 400);
    if (value.length > 200) return json({ error: 'Prompt value is too long' }, 400);

    await db.prepare('INSERT OR IGNORE INTO prompts (type, value) VALUES (?, ?)').bind(type, value).run();
    return json({ type, value }, 201);
  }

  if (request.method === 'DELETE') {
    const type = url.searchParams.get('type');
    const value = url.searchParams.get('value');
    if (!type || !value) return json({ error: 'Missing type or value query parameter' }, 400);
    if (!['task', 'unit', 'name'].includes(type)) return json({ error: 'Invalid type' }, 400);
    await db.prepare('DELETE FROM prompts WHERE type = ? AND value = ?').bind(type, value).run();
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}
