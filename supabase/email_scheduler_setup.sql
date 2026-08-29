-- Run this only after deploying the app and setting EMAIL_SCHEDULER_SECRET in Vercel.
-- Replace the placeholder with the exact same long random value used in Vercel.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select vault.create_secret(
  'REPLACE_WITH_THE_SAME_LONG_RANDOM_VALUE_USED_IN_VERCEL',
  'email_scheduler_secret',
  'Bearer secret used only by Supabase Cron to invoke the 100 Calls email queue'
);

select cron.schedule(
  '100calls-email-queue',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://100calls.co/api/email/cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'email_scheduler_secret'
        limit 1
      )
    ),
    body := jsonb_build_object('source', 'supabase-cron')
  );
  $$
);
