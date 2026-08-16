-- ============================================================================
-- Records which mailbox each email was ingested from.
--
-- Anadyon runs two mailboxes with different sensitivity:
--   customerservice@anadyon.gr — client correspondence, staff may read
--   anadyon.gr@gmail.com       — accountant, tax authorities, admin only
--
-- Today the system reads the Gmail mailbox and relies on the search query
-- `to:customerservice@anadyon.gr` to keep admin mail out of the staff-visible
-- Inbox. That makes a query string the only access boundary. This column makes
-- the boundary explicit and auditable, and is where role gating goes if admin
-- mail is ever ingested (staff -> 'customerservice' only, admin -> all).
--
-- No behaviour change on its own. Existing rows are customer mail by
-- definition, since that query is all that has ever been ingested.
-- ============================================================================

ALTER TABLE emails
  ADD COLUMN IF NOT EXISTS mailbox text NOT NULL DEFAULT 'customerservice';

COMMENT ON COLUMN emails.mailbox IS
  'Source mailbox: customerservice = client mail (staff-visible), admin = anadyon.gr@gmail.com (admin only).';

CREATE INDEX IF NOT EXISTS emails_mailbox_status_idx ON emails (mailbox, status);
