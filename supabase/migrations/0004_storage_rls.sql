-- 0004_storage_rls.sql — Family Chore Tracker: per-family RLS on the photo BYTES.
--
-- 0002 put per-family RLS on the four DATA tables (rows). The image BYTES live in
-- Supabase Storage and — until now — went through the service-role client
-- (SupabaseContext.storageClient), which BYPASSES RLS: a documented v1 compromise
-- (bytes reachable only via a family-scoped DB row, never enumerable). This migration
-- closes that gap (PRD User Story 17; these are minors' room photos). Paired wiring
-- change: the adapters now write objects under a FAMILY-ID-PREFIXED path, and the
-- container drops `storageClient` so Storage I/O runs on the AUTHENTICATED client in
-- auth mode — so these policies actually enforce. In service-role / keyless modes
-- Storage still uses the service-role (or no) client, so — like the 0002 table
-- policies — these are DORMANT-BUT-READY there and bite only at the authenticated flip.
--
-- BUCKET NAME is the LITERAL below; it must equal SUPABASE_STORAGE_BUCKET (default
-- 'chore-photos') — change both together if you rename the bucket. storage.objects
-- already has RLS enabled by the Storage extension, so we add policies only (and need
-- owner rights — run as the project's postgres/admin role, e.g. the Supabase SQL editor).
--
-- PATH SHAPE: '<family_id>/references/<chore_id>/<id>' and
-- '<family_id>/submissions/<chore_id>/<id>'. storage.foldername(name) returns the
-- folder segments, so [1] is the leading <family_id> (Postgres arrays are 1-based).
-- private.auth_family_id() (from 0002) returns NULL for the service role / a user with
-- no users row, and NULL = anything is never true, so such callers are denied
-- (deny-by-default), exactly as on the data-table policies.
--
-- LEGACY OBJECTS written before this slice sit at a non-prefixed path whose [1]
-- segment isn't a family id, so they're unreadable to authenticated clients (only the
-- service role still reaches them). Acceptable pre-launch (no real data); a real
-- migration would re-key/re-upload. SELECT + INSERT only — the app never overwrites or
-- deletes objects (uploads use upsert:false, references are versioned, nothing is
-- deleted); add UPDATE/DELETE policies if a future code path needs them.

create policy chore_photos_select_own_family on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chore-photos'
    and (storage.foldername(name))[1] = (select private.auth_family_id())::text
  );

create policy chore_photos_insert_own_family on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chore-photos'
    and (storage.foldername(name))[1] = (select private.auth_family_id())::text
  );
