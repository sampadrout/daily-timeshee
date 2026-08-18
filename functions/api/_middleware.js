import { json } from '../_shared.js';

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // 1. Allow the login endpoint without authentication
  if (url.pathname === '/api/login') {
    return context.next();
  }

  // 2. Ensure AUTH_PASSWORD is set on Cloudflare.
  // If not configured yet, notify the user with a helpful error.
  const password = env.AUTH_PASSWORD;
  if (!password) {
    return json({
      error: 'AUTH_PASSWORD environment variable is not configured on Cloudflare. Please add it to your Pages settings (Settings → Environment variables).'
    }, 500);
  }

  // 3. Check for the Authorization header
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.substring(7);

  // 4. Generate the expected token (SHA-256 hash of the password)
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const expectedToken = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  // 5. Compare tokens
  if (token !== expectedToken) {
    return json({ error: 'Unauthorized' }, 401);
  }

  return context.next();
}
