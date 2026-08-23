import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

function projectKey(name: 'SUPABASE_PUBLISHABLE_KEYS' | 'SUPABASE_SECRET_KEYS'): string {
  const keys = JSON.parse(Deno.env.get(name) ?? '{}') as Record<string, string>;
  const key = keys.default ?? Object.values(keys)[0];
  if (!key) throw new Error(`Missing ${name}`);
  return key;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const authorization = request.headers.get('Authorization') ?? '';
    const client = createClient(Deno.env.get('SUPABASE_URL')!, projectKey('SUPABASE_PUBLISHABLE_KEYS'), {
      global: { headers: { Authorization: authorization } },
    });
    const { data: { user }, error: userError } = await client.auth.getUser();
    if (userError || !user) throw new Error('인증이 필요합니다.');
    const body = await request.json();
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, projectKey('SUPABASE_SECRET_KEYS'));
    const { data: runId, error: submitError } = await admin.rpc('submit_game_run', {
      p_session_id: body.runId, p_user_id: user.id, p_score: body.score,
      p_round: body.round, p_stage_index: body.stageIndex, p_correct_hits: body.correctHits,
      p_wrong_hits: body.wrongHits, p_missed_targets: body.missedTargets,
      p_best_combo: body.bestCombo, p_duration_ms: body.durationMs,
    });
    if (submitError) throw submitError;
    const { data: rows, error: rankingError } = await admin.from('score_runs').select(
      'id, school, grade, class_no, student_no, score, round, best_combo, created_at'
    ).eq('game_version', 'moon-arcade-v1')
      .order('score', { ascending: false }).order('round', { ascending: false })
      .order('correct_hits', { ascending: false }).order('duration_ms', { ascending: true })
      .order('created_at', { ascending: true }).limit(100);
    if (rankingError) throw rankingError;
    const { data: currentRank, error: rankError } = await admin.rpc('get_run_rank', { p_run_id: runId });
    if (rankError) throw rankError;
    const entries = (rows ?? []).map((row, index) => ({
      id: row.id, rank: index + 1, school: row.school, grade: row.grade,
      classNo: row.class_no, studentNo: row.student_no, score: row.score,
      round: row.round, bestCombo: row.best_combo, createdAt: row.created_at,
    }));
    return Response.json({ entries, currentRank: Number(currentRank), currentRunId: runId }, { headers: cors });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'unknown error' }, { status: 400, headers: cors });
  }
});
