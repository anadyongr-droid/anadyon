-- Creates the reservation-documents bucket.
--
-- 001_baseline.sql carried this as a COMMENT, with a note asking an operator to
-- create the bucket by hand in the dashboard. Nobody did, so the admin document
-- feature has been broken in production since launch: every upload asks for a
-- signed URL against a bucket that does not exist and gets back
-- {"statusCode":"404","error":"Bucket not found"}.
--
-- The wider lesson is the one worth keeping: a setup step that lives in a
-- comment is a setup step that does not happen. Anything the application
-- requires belongs in a migration, where a fresh environment gets it for free
-- and a schema-drift check can notice its absence.
--
-- Private, deliberately. These are driving licences and identity documents
-- belonging to customers; every read goes through a short-lived signed URL
-- issued by an authenticated admin route, never a public object path.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'reservation-documents',
  'reservation-documents',
  false,
  -- 10 MB. A photographed licence is well under this; the limit exists so a
  -- compromised staff session cannot quietly use the bucket as free storage.
  10485760,
  -- Images and PDFs only. Notably excludes SVG, which is a script-execution
  -- vector dressed as an image, and any archive or document format that could
  -- carry active content.
  array[
    'image/jpeg',
    'image/png',
    'image/heic',
    'image/webp',
    'application/pdf'
  ]
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- No storage policies are added on purpose.
--
-- Every path into this bucket runs through /api/admin/documents, which the
-- proxy already gates on an authenticated admin or staff session, and which
-- uses the service role. Adding permissive policies would open a second door
-- to the same objects for the anon and authenticated roles — the exact shape
-- of the residual-grant problem migration 019 was written to close.
