import { json } from '../_shared.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const password = env.AUTH_PASSWORD;
  if (!password) {
    return json({
      error: 'AUTH_PASSWORD environment variable is not configured on Cloudflare. Please add it to your Pages settings (Settings → Environment variables).'
    }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  if (typeof body.password !== 'string' || !body.password) {
    return json({ error: 'Password is required' }, 400);
  }

  if (body.password !== password) {
    return json({ error: 'Incorrect password' }, 401);
  }

  // Generate a SHA-256 hash of the password as the token
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const token = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  return json({ token });
}
