import { json } from '../_shared.js';

export async function onRequest(context) {
  const { request, env, url } = context;
  const db = env.DB;
  if (!db) return json({ error: 'Database is not configured' }, 500);

  if (request.method === 'GET') {
    const { results } = await db.prepare('SELECT name FROM tasks ORDER BY name').all();
    return json({ tasks: results.map((r) => r.name) });
  }

  if (request.method === 'POST') {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Body must be valid JSON' }, 400);
    }
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return json({ error: 'Task name is required' }, 400);
    if (name.length > 200) return json({ error: 'Task name is too long' }, 400);

    await db.prepare('INSERT OR IGNORE INTO tasks (name) VALUES (?)').bind(name).run();
    return json({ name }, 201);
  }

  if (request.method === 'DELETE') {
    const name = url.searchParams.get('name');
    if (!name) return json({ error: 'Missing name query parameter' }, 400);
    await db.prepare('DELETE FROM tasks WHERE name = ?').bind(name).run();
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}
