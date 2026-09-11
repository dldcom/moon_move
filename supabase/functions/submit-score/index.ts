import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
};

const MOON_MOVE_GAME_ID = 'moon-move';
const MOON_MOVE_NICKNAME_BASES = [
  '\uB2EC\uD1A0\uB07C',
  '\uBCC4\uAC00\uB8E8',
  '\uCD08\uC2B9\uB2EC',
  '\uBCF4\uB984\uB2EC',
  '\uC6B0\uC8FC\uBE44\uD589\uC0AC',
  '\uD61C\uC131',
  '\uBC24\uAD6C\uB984',
  '\uC740\uD558\uC218',
  '\uB2EC\uBE5B\uD0D0\uD5D8\uAC00',
  '\uBCC4\uB625\uBCC4',
  '\uC6B0\uC8FC\uACE0\uC591\uC774',
  '\uD06C\uB808\uC774\uD130\uD0D0\uD5D8\uB300',
];
const MOON_MOVE_NICKNAMES = new Set(
  MOON_MOVE_NICKNAME_BASES.flatMap((base) =>
    Array.from({ length: 20 }, (_, index) => `${base}-${String(index + 1).padStart(2, '0')}`),
  ),
);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function projectKey(name: 'SUPABASE_SECRET_KEYS'): string {
  const keys = JSON.parse(Deno.env.get(name) ?? '{}') as Record<string, string>;
  const key = keys.default ?? Object.values(keys)[0];
  if (!key) throw new Error(`Missing ${name}`);
  return key;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') {
    return Response.json({ error: 'POST requests only.' }, { status: 405, headers: cors });
  }

  try {
    const body = await request.json() as Record<string, unknown>;
    const gameId = String(body.gameId ?? '').trim();
    const nickname = String(body.nickname ?? '').trim();
    const score = Number(body.score);
    const roomIdValue = body.roomId;
    const roomId = roomIdValue === null || roomIdValue === undefined || roomIdValue === ''
      ? null
      : String(roomIdValue).trim();

    if (!gameId) throw new Error('gameId is required.');
    if (!nickname || nickname.length > 32) throw new Error('Choose a valid nickname.');
    if (!Number.isSafeInteger(score) || score < 0 || score > 1_000_000_000) {
      throw new Error('Choose a valid score.');
    }
    if (roomId !== null && !UUID_PATTERN.test(roomId)) throw new Error('Choose a valid roomId.');
    if (gameId === MOON_MOVE_GAME_ID) {
      if (roomId !== null) throw new Error('Moon Move does not use roomId.');
      if (!MOON_MOVE_NICKNAMES.has(nickname)) throw new Error('Choose one of the available nicknames.');
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      projectKey('SUPABASE_SECRET_KEYS'),
    );
    const { data, error } = await admin.rpc('submit_score', {
      p_game_id: gameId,
      p_room_id: roomId,
      p_nickname: nickname,
      p_score: score,
    });
    if (error) throw error;
    return Response.json(data, { headers: cors });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'unknown error' },
      { status: 400, headers: cors },
    );
  }
});
