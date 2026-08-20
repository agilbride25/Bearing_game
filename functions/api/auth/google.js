import { jwtVerify, createRemoteJWKSet } from 'jose';

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com';

export async function onRequestPost(context) {
  const { request, env } = context;
  const { credential } = await request.json();

  let payload;
  try {
    ({ payload } = await jwtVerify(credential, GOOGLE_JWKS, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: CLIENT_ID,
    }));
  } catch (err) {
    return new Response('Invalid token', { status: 401 });
  }

  const playerId = payload.sub;
  const displayName = payload.name || null;

  await env.DB.prepare(
    `INSERT INTO players (id, display_name, created_at)
     VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name`
  ).bind(playerId, displayName, Date.now()).run();

  const sessionToken = await signSession(playerId, env.SESSION_SECRET);

  return new Response(JSON.stringify({ ok: true, displayName }), {
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `session=${sessionToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`
    }
  });
}

async function signSession(sub, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const payload = btoa(JSON.stringify({ sub, exp: Date.now() + 30*24*60*60*1000 }));
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${payload}.${sigB64}`;
}