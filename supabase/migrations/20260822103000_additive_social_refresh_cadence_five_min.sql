do $cron$
begin
  begin
    perform cron.unschedule('refresh-leaderboard-standings');
  exception
    when others then null;
  end;

  begin
    perform cron.unschedule('refresh-challenge-progress');
  exception
    when others then null;
  end;

  perform cron.schedule(
    'refresh-leaderboard-standings',
    '* * * * *',
    $job$select public.refresh_leaderboard_standings_service()$job$
  );

  perform cron.schedule(
    'refresh-challenge-progress',
    '* * * * *',
    $job$select public.refresh_challenge_progress_service()$job$
  );
exception
  when others then null;
end;
$cron$;
