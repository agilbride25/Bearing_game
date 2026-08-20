export async function getPlayerId(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return null;

  const [payloadB64, sigB64] = match[1].split('.');
  if (!payloadB64 || !sigB64) return null;

  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const sig = Uint8Array.from(atob(sigB64), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sig, enc.encode(payloadB64));
    if (!valid) return null;

    const payload = JSON.parse(atob(payloadB64));
    if (payload.exp < Date.now()) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}