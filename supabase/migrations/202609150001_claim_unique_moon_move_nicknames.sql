create table public.nickname_claims (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references public.games(id) on delete cascade,
  room_id uuid,
  nickname text not null check (char_length(btrim(nickname)) between 1 and 32),
  claim_date date not null default ((now() at time zone 'Asia/Seoul')::date)
);

create unique index nickname_claims_global_unique
  on public.nickname_claims (game_id, nickname, claim_date)
  where room_id is null;

create unique index nickname_claims_room_unique
  on public.nickname_claims (game_id, room_id, nickname, claim_date)
  where room_id is not null;

create unique index scores_moon_move_nickname_unique
  on public.scores (game_id, nickname)
  where game_id = 'moon-move' and room_id is null;

alter table public.nickname_claims enable row level security;
revoke all on table public.nickname_claims from anon, authenticated;

create or replace function public.claim_nickname(
  p_game_id text,
  p_room_id uuid,
  p_base_nickname text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_nickname text := btrim(p_base_nickname);
  candidate_nickname text;
  current_day date := (now() at time zone 'Asia/Seoul')::date;
  suffix integer;
begin
  if p_game_id is null or not exists (
    select 1 from public.games where id = p_game_id
  ) then
    raise exception 'invalid game';
  end if;

  if base_nickname is null or char_length(base_nickname) not between 1 and 29 then
    raise exception 'invalid base nickname';
  end if;

  if p_game_id = 'moon-move' then
    if p_room_id is not null then
      raise exception 'Moon Move does not use roomId';
    end if;
    if base_nickname not in (
      '달토끼', '별가루', '초승달', '보름달', '우주비행사', '혜성',
      '밤구름', '은하수', '달빛탐험가', '별똥별', '우주고양이', '크레이터탐험대'
    ) then
      raise exception 'invalid base nickname';
    end if;
  end if;

  for suffix in 1..20 loop
    candidate_nickname := base_nickname || '-' || lpad(suffix::text, 2, '0');
    begin
      insert into public.nickname_claims (game_id, room_id, nickname, claim_date)
      values (p_game_id, p_room_id, candidate_nickname, current_day);
      return candidate_nickname;
    exception when unique_violation then
      -- Another player claimed this candidate first. Try the next number.
      null;
    end;
  end loop;

  raise exception 'no nickname available';
end;
$$;

revoke all on function public.claim_nickname(text, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_nickname(text, uuid, text) to authenticated;

create or replace function public.submit_score(
  p_game_id text,
  p_room_id uuid,
  p_nickname text,
  p_score bigint
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_nickname text := btrim(p_nickname);
  new_score_id uuid;
  current_rank bigint;
  entries jsonb;
begin
  if p_game_id is null or not exists (
    select 1 from public.games where id = p_game_id
  ) then
    raise exception 'invalid game';
  end if;
  if clean_nickname is null or char_length(clean_nickname) not between 1 and 32 then
    raise exception 'invalid nickname';
  end if;
  if p_score is null or p_score < 0 then
    raise exception 'invalid score';
  end if;

  if p_game_id = 'moon-move' then
    if p_room_id is not null then
      raise exception 'Moon Move does not use roomId';
    end if;
    if not exists (
      select 1
      from public.nickname_claims
      where game_id = p_game_id
        and room_id is null
        and nickname = clean_nickname
        and claim_date = (now() at time zone 'Asia/Seoul')::date
    ) then
      raise exception 'nickname was not claimed';
    end if;
  end if;

  insert into public.scores (game_id, room_id, nickname, score)
  values (p_game_id, p_room_id, clean_nickname, p_score)
  returning id into new_score_id;

  with ranked as (
    select id, nickname, score,
      rank() over (order by score desc) as score_rank
    from public.scores
    where game_id = p_game_id
      and room_id is not distinct from p_room_id
  ),
  top_rows as (
    select id, nickname, score, score_rank
    from ranked
    order by score desc, nickname asc, id asc
    limit 10
  )
  select
    (select score_rank from ranked where id = new_score_id),
    coalesce(
      (select jsonb_agg(
        jsonb_build_object(
          'id', id,
          'rank', score_rank,
          'nickname', nickname,
          'score', score
        )
        order by score desc, nickname asc, id asc
      ) from top_rows),
      '[]'::jsonb
    )
  into current_rank, entries;

  return jsonb_build_object(
    'entries', entries,
    'currentRank', current_rank,
    'currentRunId', new_score_id
  );
end;
$$;

revoke all on function public.submit_score(text, uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.submit_score(text, uuid, text, bigint) to service_role;

do $do$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'moon-move-daily-score-cleanup';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'moon-move-daily-score-cleanup',
    '0 15 * * *',
    $job$delete from public.scores where game_id = 'moon-move' and room_id is null;
delete from public.nickname_claims where game_id = 'moon-move'$job$
  );
end;
$do$;
