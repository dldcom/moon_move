create extension if not exists pgcrypto;

create table public.games (
  id text primary key,
  name text not null check (char_length(btrim(name)) between 1 and 80)
);

create table public.scores (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references public.games(id) on delete cascade,
  room_id uuid,
  nickname text not null check (char_length(btrim(nickname)) between 1 and 32),
  score bigint not null check (score >= 0)
);

create index scores_ranking_idx on public.scores (game_id, room_id, score desc);

insert into public.games (id, name)
values ('moon-move', 'Moon Move')
on conflict (id) do update set name = excluded.name;

alter table public.games enable row level security;
alter table public.scores enable row level security;
revoke all on table public.games from anon, authenticated;
revoke all on table public.scores from anon, authenticated;

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
  new_score_id uuid;
  current_rank bigint;
  entries jsonb;
begin
  if p_game_id is null or not exists (
    select 1 from public.games where id = p_game_id
  ) then
    raise exception 'invalid game';
  end if;
  if p_nickname is null or char_length(btrim(p_nickname)) not between 1 and 32 then
    raise exception 'invalid nickname';
  end if;
  if p_score is null or p_score < 0 then
    raise exception 'invalid score';
  end if;

  insert into public.scores (game_id, room_id, nickname, score)
  values (p_game_id, p_room_id, btrim(p_nickname), p_score)
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
