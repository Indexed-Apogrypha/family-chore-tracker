-- 0007_storage_bucket.sql — create the private photo bucket.
--
-- The Storage bucket that holds reference + submission photo BYTES was the last
-- manual prerequisite (the earlier migrations assumed it already existed). This
-- makes it reproducible: a fresh deploy gets the bucket from the migrations alone.
--
-- PRIVATE (public = false): the bytes are minors' room photos, reachable only via a
-- family-scoped path under the 0004 Storage RLS (never publicly enumerable). The id
-- is the LITERAL 'chore-photos' — it must equal SUPABASE_STORAGE_BUCKET and the
-- bucket literal in 0004_storage_rls.sql (change all three together to rename).
--
-- Idempotent (`on conflict do nothing`), so re-running against a project that already
-- has the bucket — e.g. one created earlier by hand — is a no-op and never alters its
-- settings. No file_size_limit / allowed_mime_types are set here (matching the
-- existing bucket; the Server Action already caps size + checks image/* — see
-- app/actions.ts); add them as optional hardening on a fresh bucket if desired.
insert into storage.buckets (id, name, public)
values ('chore-photos', 'chore-photos', false)
on conflict (id) do nothing;
