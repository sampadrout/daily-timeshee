import { json } from '../../_shared.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  if (!env.DB) return json({ error: 'Database is not configured' }, 500);
  if (request.method !== 'DELETE') return json({ error: 'Method not allowed' }, 405);

  const { meta } = await env.DB.prepare('DELETE FROM entries WHERE id = ?').bind(params.id).run();
  if (meta.changes === 0) return json({ error: 'Entry not found' }, 404);
  return json({ ok: true });
}
