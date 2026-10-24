-- Read-only. Does the APPLICATION's alert path deliver, or does it queue?
--
-- WHY THIS EXISTS. Four alert paths send to the same Telegram channel, and
-- three of them run on GitHub's machines with the credential in Actions
-- secrets: the nightly fingerprint (fired for real four times, and deliberately
-- on 8 October), the nightly backup, and `alert-test.yml`. The fourth is the
-- application itself -- the Stripe webhook, the morning briefing, the email
-- watchdog, the mailer -- and it reads `TELEGRAM_BOT_TOKEN` and
-- `TELEGRAM_CHAT_ID` from **Vercel** project settings, not from Actions. That
-- path is E20 and it has never been proven.
--
-- It cannot be proven by reading the code, and that is the point:
-- `lib/telegram.ts` returns early and silently when the token is absent
-- ("TELEGRAM_BOT_TOKEN not set -- skipping Telegram alert", to a log nobody
-- reads), and it falls back to a **hardcoded** chat id when only
-- `TELEGRAM_CHAT_ID` is missing. So a misconfiguration in Vercel produces
-- either no alert at all or an alert to a group nobody is watching, and in
-- neither case does anything go red.
--
-- `alert_outbox` is where the answer is. Every delivery that Telegram did not
-- accept is written there by `queue()` with the reason in `error`, and the
-- daily cron retries it for 48 hours before marking it abandoned. So:
--
--   * `tg:` rows with `sent_at` null and a recent `created_at`  -> the path is
--     reaching the code and FAILING to deliver; `error` says why.
--   * `tg:` rows marked `abandoned:`                           -> an alert was
--     raised and never got through at all.
--   * `tg:` rows with `sent_at` set                            -> the queue
--     drained, so the path and the cron both work.
--   * **no `tg:` rows ever**                                   -> either every
--     send has succeeded first time, or no send has been attempted. Those two
--     are distinguished by the `briefing:` rows below, which the morning cron
--     writes on every run whether or not an alert was sent.
--
-- NO PAYLOAD IS READ. An alert body can carry a customer's name and booking
-- (DEFINING-STATEMENTS.md §6), and this output lands in check-run annotations
-- on a PUBLIC repository. Keys, timestamps, and the delivery error only -- and
-- the error is Telegram's own description ("chat not found", "Unauthorized"),
-- which is what is actually diagnostic.

-- 1. Every prefix in the table, with how fresh it is and how much is stuck.
--    `briefing:` proves the Vercel cron runs at all; `tg:` proves whether its
--    alerts are delivered.
select
  'by prefix' as section,
  split_part(key, ':', 1) as prefix,
  count(*)::text as rows,
  count(*) filter (where sent_at is null)::text as unsent,
  coalesce(max(created_at)::date::text, '-') as newest,
  coalesce(min(created_at)::date::text, '-') as oldest
  from public.alert_outbox
 group by 1, 2

union all

-- 2. The queued-Telegram rows specifically, which is the E20 answer.
select
  'telegram queue',
  'tg:',
  count(*)::text,
  count(*) filter (where sent_at is null)::text,
  count(*) filter (where error like 'abandoned:%')::text || ' abandoned',
  coalesce(max(created_at)::date::text, 'none ever queued')
  from public.alert_outbox
 where key like 'tg:%'

union all

-- 3. The distinct delivery errors, which name the misconfiguration if there is
--    one. Telegram's own description, never the message body.
select
  'delivery error',
  left(coalesce(error, '(none)'), 120),
  count(*)::text,
  '',
  coalesce(max(created_at)::date::text, '-'),
  ''
  from public.alert_outbox
 where error is not null
 group by 2

order by 1, 2;
