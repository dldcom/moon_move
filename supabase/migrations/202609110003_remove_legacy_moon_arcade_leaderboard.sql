-- The new frontend and submit-score function no longer use the original
-- one-game session/run model. Remove its tables and helper functions after
-- the unified games/scores schema has been deployed.
drop function if exists public.submit_game_run(
  uuid, uuid, integer, integer, integer, integer, integer, integer, integer, integer
);
drop function if exists public.get_run_rank(uuid);

drop table if exists public.score_runs;
drop table if exists public.game_sessions;
