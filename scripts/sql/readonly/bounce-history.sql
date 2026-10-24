-- Read-only. Has mail been bouncing before today, or is 23 October the first?
--
-- WHY THIS EXISTS. On 23 October 2026 Yahoo refused a reply sent from Gmail as
-- `anadyon.gr` (`550 5.7.9`, SPF and DKIM both failing — E34). Tasos's question
-- was the right one: *"I have done this several times since we went live back
-- in August and we never had an issue. Why all of a sudden?"*
--
-- There are two candidate answers and they call for different actions:
--
--   1. **Nothing changed.** The Google path has failed authentication since
--      August, but Gmail and Outlook do not hard-reject an individual sender
--      for it — they accept and may filter. Yahoo does reject. On this reading
--      the problem is not new, only newly *visible*, and some earlier replies
--      may have been silently spam-filed.
--   2. **The route changed.** If the alias had been relaying through
--      `mail.anadyon.gr`, both checks would have passed — SPF on `+mx`, DKIM on
--      the `default` selector that is published. E6's certificate for
--      `*.anadyon.gr` was due to expire around **13 October**, ten days before
--      this bounce, and an expired certificate breaks an SMTP relay.
--
-- **A bounce leaves a trace in the mailbox**, and `emails` is the synced copy
-- of it. So: count delivery-failure messages per month. Earlier bounces
-- support reading 1; a clean record before October supports reading 2.
--
-- NO SUBJECT, NO BODY, NO CUSTOMER ADDRESS IS RETURNED. A bounce subject
-- contains the failed recipient, and this output lands in check-run
-- annotations on a PUBLIC repository (§6). Month, the robot sender's domain,
-- and a count: enough to answer the question and incapable of carrying a
-- customer's address.

-- 1. Delivery-failure messages per month, by the reporting robot's domain.
select
  'bounces by month' as section,
  to_char(date_trunc('month', received_at), 'YYYY-MM') as month,
  split_part(lower(sender_email), '@', 2) as sender_domain,
  count(*)::text as messages
  from public.emails
 where lower(sender_email) ~ '(mailer-daemon|postmaster|mail-?delivery|noreply-dmarc)'
 group by 1, 2, 3

union all

-- 2. Total synced mail per month, as the denominator. A month with no bounces
--    and no mail at all says nothing; a month with plenty of mail and no
--    bounces says something.
select
  'all mail by month',
  to_char(date_trunc('month', received_at), 'YYYY-MM'),
  '(any sender)',
  count(*)::text
  from public.emails
 group by 1, 2, 3

order by 1 desc, 2, 3;
