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
    const school = String(body.school ?? '').trim().slice(0, 30);
    const grade = Number(body.grade);
    const classNo = Number(body.classNo);
    const studentNo = Number(body.studentNo);
    if (!school || grade < 1 || grade > 6 || classNo < 1 || classNo > 30 || studentNo < 1 || studentNo > 99) {
      throw new Error('학생 정보가 올바르지 않습니다.');
    }
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, projectKey('SUPABASE_SECRET_KEYS'));
    const { data, error } = await admin.from('game_sessions').insert({
      user_id: user.id, school, grade, class_no: classNo, student_no: studentNo, seed,
    }).select('id, seed').single();
    if (error) throw error;
    return Response.json({ runId: data.id, seed: data.seed }, { headers: cors });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'unknown error' }, { status: 400, headers: cors });
  }
});
