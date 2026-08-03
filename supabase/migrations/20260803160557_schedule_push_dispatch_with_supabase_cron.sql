create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;

select cron.schedule(
  'dispatch-push-notifications-hourly',
  '0 * * * *',
  $$
    with push_cron_secrets as (
      select
        (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'push_dispatch_url'
        ) as dispatch_url,
        (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'push_cron_secret'
        ) as cron_secret
    )
    select net.http_post(
      url := dispatch_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || cron_secret
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000
    )
    from push_cron_secrets
    where dispatch_url is not null
      and cron_secret is not null;
  $$
);
