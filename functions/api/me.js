import { getPlayerId, json } from '../_lib/session.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const playerId = await getPlayerId(request, env);
  if (!playerId) return json(null);

  const row = await env.DB.prepare(
    `SELECT display_name FROM players WHERE id = ?`
  ).bind(playerId).first();

  return json(row ? { displayName: row.display_name } : null);
}