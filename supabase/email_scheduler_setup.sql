-- Run this only after deploying the app and setting EMAIL_SCHEDULER_SECRET in Vercel.
-- Replace the placeholder locally before pasting this into Supabase SQL Editor.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  existing_secret_id uuid;
begin
  select id into existing_secret_id
  from vault.decrypted_secrets
  where name = 'email_scheduler_secret'
  order by created_at desc
  limit 1;

  if existing_secret_id is null then
    perform vault.create_secret(
      'REPLACE_WITH_THE_SAME_LONG_RANDOM_VALUE_USED_IN_VERCEL',
      'email_scheduler_secret',
      'Bearer secret used only by Supabase Cron to invoke the 100 Calls email queue'
    );
  else
    perform vault.update_secret(
      existing_secret_id,
      'REPLACE_WITH_THE_SAME_LONG_RANDOM_VALUE_USED_IN_VERCEL',
      'email_scheduler_secret',
      'Bearer secret used only by Supabase Cron to invoke the 100 Calls email queue'
    );
  end if;
end
$$;

select cron.unschedule(jobid)
from cron.job
where jobname = '100calls-email-queue';

select cron.schedule(
  '100calls-email-queue',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://www.100calls.co/api/email/cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'email_scheduler_secret'
        limit 1
      )
    ),
    body := jsonb_build_object('source', 'supabase-cron'),
    timeout_milliseconds := 10000
  );
  $$
);
