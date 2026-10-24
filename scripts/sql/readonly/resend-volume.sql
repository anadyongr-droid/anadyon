-- Read-only. How much of Resend's free-tier allowance is already spent?
--
-- WHY THIS EXISTS. The zero-cost replacement for Papaki mail
-- (`docs/MAILBOX-PROVIDER-OPTIONS.md` §2) relays staff replies through Resend
-- SMTP. Tasos confirmed on 24 October 2026 that the project is on Resend's
-- **free plan**, which allows **3,000 emails a month and 100 a day** — and
-- that allowance is already being spent on booking confirmations.
--
-- So the question that decides whether the free option is viable is not "how
-- many emails does Resend allow" but "how many are left". Two numbers settle
-- it: the busiest day so far, and the busiest month.
--
-- **If the peak day is comfortably under 100**, staff replies fit alongside
-- booking mail and the option costs nothing. **If it is near 100**, Resend Pro
-- is $20/month with no daily cap — still well under Google Workspace, and the
-- decision becomes a cheap one rather than a blocked one.
--
-- NO RECIPIENT, NO SUBJECT, NO ADDRESS IS RETURNED. This table holds customer
-- email addresses and booking subjects, and this output lands in check-run
-- annotations on a PUBLIC repository (§6). Dates and counts only.

-- 1. The ten busiest days, which is where a 100/day cap would bite.
select
  'busiest days' as section,
  to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as period,
  count(*)::text as emails
  from public.booking_email_deliveries
 group by 1, 2
 order by count(*) desc, 2 desc
 limit 10;

-- 2. Per month against the 3,000 allowance, plus the all-time total and the
--    span, so a low number can be read as "quiet" rather than "not recording".
select
  'by month' as section,
  to_char(date_trunc('month', created_at), 'YYYY-MM') as period,
  count(*)::text as emails
  from public.booking_email_deliveries
 group by 1, 2
 order by 2 desc;

select
  'all time' as section,
  coalesce(min(created_at)::date::text, '-') || ' .. ' || coalesce(max(created_at)::date::text, '-') as period,
  count(*)::text as emails
  from public.booking_email_deliveries;
