create extension if not exists pgcrypto;

create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  school text not null check (char_length(school) between 1 and 30),
  grade smallint not null check (grade between 1 and 6),
  class_no smallint not null check (class_no between 1 and 30),
  student_no smallint not null check (student_no between 1 and 99),
  seed bigint not null,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 hours'),
  used_at timestamptz
);

create table public.score_runs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.game_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  school text not null,
  grade smallint not null,
  class_no smallint not null,
  student_no smallint not null,
  score integer not null check (score >= 0),
  round smallint not null check (round >= 1),
  stage_index smallint not null check (stage_index between 0 and 4),
  correct_hits integer not null check (correct_hits >= 0),
  wrong_hits integer not null check (wrong_hits >= 0),
  missed_targets integer not null check (missed_targets >= 0),
  best_combo integer not null check (best_combo >= 0),
  duration_ms integer not null check (duration_ms >= 0),
  game_version text not null default 'moon-arcade-v1',
  created_at timestamptz not null default now()
);

create index score_runs_ranking_idx on public.score_runs
  (score desc, round desc, correct_hits desc, duration_ms asc, created_at asc);

alter table public.game_sessions enable row level security;
alter table public.score_runs enable row level security;
revoke all on public.game_sessions from anon, authenticated;
revoke all on public.score_runs from anon, authenticated;

create or replace function public.submit_game_run(
  p_session_id uuid, p_user_id uuid, p_score integer, p_round integer,
  p_stage_index integer, p_correct_hits integer, p_wrong_hits integer,
  p_missed_targets integer, p_best_combo integer, p_duration_ms integer
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  session_row public.game_sessions%rowtype;
  new_run_id uuid;
  server_elapsed_ms bigint;
begin
  select * into session_row from public.game_sessions
  where id = p_session_id and user_id = p_user_id for update;
  if not found then raise exception 'invalid session'; end if;
  if session_row.used_at is not null then raise exception 'session already used'; end if;
  if session_row.expires_at < now() then raise exception 'session expired'; end if;
  if p_score < 0 or p_score > p_correct_hits * 500 then raise exception 'impossible score'; end if;
  if p_round < 1 or p_stage_index not between 0 and 4 then raise exception 'invalid progress'; end if;
  if p_correct_hits < 0 or p_wrong_hits < 0 or p_missed_targets < 0 or p_best_combo < 0 then raise exception 'invalid stats'; end if;
  server_elapsed_ms := floor(extract(epoch from (now() - session_row.started_at)) * 1000);
  if p_duration_ms < 0 or p_duration_ms > server_elapsed_ms + 15000 then raise exception 'invalid duration'; end if;

  insert into public.score_runs (
    session_id, user_id, school, grade, class_no, student_no, score, round,
    stage_index, correct_hits, wrong_hits, missed_targets, best_combo, duration_ms
  ) values (
    session_row.id, session_row.user_id, session_row.school, session_row.grade,
    session_row.class_no, session_row.student_no, p_score, p_round, p_stage_index,
    p_correct_hits, p_wrong_hits, p_missed_targets, p_best_combo, p_duration_ms
  ) returning id into new_run_id;

  update public.game_sessions set used_at = now() where id = session_row.id;
  return new_run_id;
end;
$$;

create or replace function public.get_run_rank(p_run_id uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  with ranked as (
    select id, row_number() over (
      order by score desc, round desc, correct_hits desc, duration_ms asc, created_at asc
    ) as rank
    from public.score_runs where game_version = 'moon-arcade-v1'
  ) select rank from ranked where id = p_run_id;
$$;

revoke execute on function public.submit_game_run from public, anon, authenticated;
revoke execute on function public.get_run_rank from public, anon, authenticated;
grant execute on function public.submit_game_run to service_role;
grant execute on function public.get_run_rank to service_role;
