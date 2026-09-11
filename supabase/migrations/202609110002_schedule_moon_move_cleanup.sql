create extension if not exists pg_cron;

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
    $$delete from public.scores where game_id = 'moon-move' and room_id is null$$
  );
end;
$do$;
