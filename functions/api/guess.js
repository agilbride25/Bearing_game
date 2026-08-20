import { getPlayerId, json } from '../_lib/session.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const playerId = await getPlayerId(request, env);
  if (!playerId) return json(null);

  const url = new URL(request.url);
  const mode = url.searchParams.get('mode');
  const date = url.searchParams.get('date');
  if (!mode || !date) return new Response('Missing mode/date', { status: 400 });

  const row = await env.DB.prepare(
    `SELECT guesses_json, finished FROM daily_state WHERE player_id = ? AND mode = ? AND date = ?`
  ).bind(playerId, mode, date).first();

  return json(row ? { guesses: JSON.parse(row.guesses_json), finished: !!row.finished } : null);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const playerId = await getPlayerId(request, env);
  if (!playerId) return new Response('Not signed in', { status: 401 });

  const { mode, date, guesses, finished, won } = await request.json();
  if (!mode || !date || !Array.isArray(guesses)) {
    return new Response('Bad request', { status: 400 });
  }

  const prior = await env.DB.prepare(
    `SELECT finished FROM daily_state WHERE player_id = ? AND mode = ? AND date = ?`
  ).bind(playerId, mode, date).first();
  const alreadyFinished = !!prior?.finished;

  await env.DB.prepare(
    `INSERT INTO daily_state (player_id, mode, date, guesses_json, finished)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(player_id, mode, date) DO UPDATE SET
       guesses_json = excluded.guesses_json, finished = excluded.finished`
  ).bind(playerId, mode, date, JSON.stringify(guesses), finished ? 1 : 0).run();

  let stats = null;
  if (finished && !alreadyFinished) {
    stats = await updateStreak(env, playerId, mode, date, !!won);
  }

  return json({ ok: true, stats });
}

async function updateStreak(env, playerId, mode, date, won) {
  const existing = await env.DB.prepare(
    `SELECT * FROM player_stats WHERE player_id = ? AND mode = ?`
  ).bind(playerId, mode).first();

  const isConsecutive = existing?.last_played_date && isYesterday(existing.last_played_date, date);
  const played = (existing?.played || 0) + 1;
  const wins = (existing?.wins || 0) + (won ? 1 : 0);
  const streak = won ? ((isConsecutive ? (existing?.streak || 0) : 0) + 1) : 0;
  const maxStreak = Math.max(existing?.max_streak || 0, streak);

  await env.DB.prepare(
    `INSERT INTO player_stats (player_id, mode, played, wins, streak, max_streak, last_played_date)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(player_id, mode) DO UPDATE SET
       played = excluded.played, wins = excluded.wins, streak = excluded.streak,
       max_streak = excluded.max_streak, last_played_date = excluded.last_played_date`
  ).bind(playerId, mode, played, wins, streak, maxStreak, date).run();

  return { played, wins, streak, maxStreak };
}

function isYesterday(prevStr, curStr) {
  const prev = new Date(prevStr + 'T00:00:00Z');
  const cur = new Date(curStr + 'T00:00:00Z');
  return (cur - prev) / 86400000 === 1;
}