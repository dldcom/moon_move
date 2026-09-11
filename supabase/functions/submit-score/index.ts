import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
};
const MOON_MOVE_GAME_ID = 'moon-move';
const MOON_MOVE_NICKNAMES = new Set([
  '달토끼',
  '별가루',
  '초승달',
  '보름달',
  '우주비행사',
  '혜성',
  '밤구름',
  '은하수',
  '달빛탐험가',
  '별똥별',
  '우주고양이',
  '크레이터탐험대',
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function projectKey(name: 'SUPABASE_PUBLISHABLE_KEYS' | 'SUPABASE_SECRET_KEYS'): string {
  const keys = JSON.parse(Deno.env.get(name) ?? '{}') as Record<string, string>;
  const key = keys.default ?? Object.values(keys)[0];
  if (!key) throw new Error(`Missing ${name}`);
  return key;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') {
    return Response.json({ error: 'POST 요청만 사용할 수 있어요.' }, { status: 405, headers: cors });
  }

  try {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.runId === 'string' && body.runId) {
      const authorization = request.headers.get('Authorization') ?? '';
      const legacyResult = await submitLegacyScore(body, authorization);
      return Response.json(legacyResult, { headers: cors });
    }

    const gameId = String(body.gameId ?? '').trim();
    const nickname = String(body.nickname ?? '').trim();
    const score = Number(body.score);
    const roomIdValue = body.roomId;
    const roomId = roomIdValue === null || roomIdValue === undefined || roomIdValue === ''
      ? null
      : String(roomIdValue).trim();

    if (!gameId) throw new Error('gameId가 필요해요.');
    if (!nickname || nickname.length > 32) throw new Error('닉네임을 확인해 주세요.');
    if (!Number.isSafeInteger(score) || score < 0 || score > 1_000_000_000) {
      throw new Error('점수를 확인해 주세요.');
    }
    if (roomId !== null && !UUID_PATTERN.test(roomId)) throw new Error('roomId를 확인해 주세요.');
    if (gameId === MOON_MOVE_GAME_ID) {
      if (roomId !== null) throw new Error('Moon Move는 roomId를 사용하지 않아요.');
      if (!MOON_MOVE_NICKNAMES.has(nickname)) throw new Error('선택할 수 없는 닉네임이에요.');
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

async function submitLegacyScore(body: Record<string, unknown>, authorization: string) {
  const authClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    projectKey('SUPABASE_PUBLISHABLE_KEYS'),
    { global: { headers: { Authorization: authorization } } },
  );
  const { data: { user }, error: userError } = await authClient.auth.getUser();
  if (userError || !user) throw new Error('인증이 필요해요.');

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    projectKey('SUPABASE_SECRET_KEYS'),
  );
  const { data: runId, error: submitError } = await admin.rpc('submit_game_run', {
    p_session_id: body.runId,
    p_user_id: user.id,
    p_score: body.score,
    p_round: body.round,
    p_stage_index: body.stageIndex,
    p_correct_hits: body.correctHits,
    p_wrong_hits: body.wrongHits,
    p_missed_targets: body.missedTargets,
    p_best_combo: body.bestCombo,
    p_duration_ms: body.durationMs,
  });
  if (submitError) throw submitError;

  const { data: rows, error: rankingError } = await admin.from('score_runs').select(
    'id, school, grade, class_no, student_no, score, round, best_combo, created_at',
  ).eq('game_version', 'moon-arcade-v1')
    .order('score', { ascending: false }).order('round', { ascending: false })
    .order('correct_hits', { ascending: false }).order('duration_ms', { ascending: true })
    .order('created_at', { ascending: true }).limit(100);
  if (rankingError) throw rankingError;

  const { data: currentRank, error: rankError } = await admin.rpc('get_run_rank', { p_run_id: runId });
  if (rankError) throw rankError;
  const entries = (rows ?? []).map((row, index) => ({
    id: row.id,
    rank: index + 1,
    school: row.school,
    grade: row.grade,
    classNo: row.class_no,
    studentNo: row.student_no,
    score: row.score,
    round: row.round,
    bestCombo: row.best_combo,
    createdAt: row.created_at,
  }));
  return { entries, currentRank: Number(currentRank), currentRunId: runId };
}
