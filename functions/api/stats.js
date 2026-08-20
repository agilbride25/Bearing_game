import { getPlayerId, json } from '../_lib/session.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const playerId = await getPlayerId(request, env);
  if (!playerId) return json(null);

  const url = new URL(request.url);
  const mode = url.searchParams.get('mode') || 'iter';

  const row = await env.DB.prepare(
    `SELECT played, wins, streak, max_streak FROM player_stats WHERE player_id = ? AND mode = ?`
  ).bind(playerId, mode).first();

  return json(row
    ? { played: row.played, wins: row.wins, streak: row.streak, maxStreak: row.max_streak }
    : { played: 0, wins: 0, streak: 0, maxStreak: 0 });
}