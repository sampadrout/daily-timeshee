import { json, normalizeEntry } from '../../_shared.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  if (!env.DB) return json({ error: 'Database is not configured' }, 500);

  if (request.method === 'PUT') {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Body must be valid JSON' }, 400);
    }

    const { entry, error } = normalizeEntry({ ...body, id: params.id });
    if (error) return json({ error }, 400);

    const { meta } = await env.DB.prepare(
      'UPDATE entries SET date = ?, task = ?, description = ?, hours = ? WHERE id = ?'
    )
      .bind(entry.date, entry.task, entry.description, entry.hours, params.id)
      .run();

    if (meta.changes === 0) return json({ error: 'Entry not found' }, 404);
    return json({ entry: { ...entry, id: params.id } });
  }

  if (request.method === 'DELETE') {
    const { meta } = await env.DB.prepare('DELETE FROM entries WHERE id = ?').bind(params.id).run();
    if (meta.changes === 0) return json({ error: 'Entry not found' }, 404);
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}
