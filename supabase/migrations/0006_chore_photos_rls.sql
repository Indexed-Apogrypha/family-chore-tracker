-- 0006_chore_photos_rls.sql — M6 follow-up (#113).
--
-- Per-path RLS on the private `chore-photos` bucket, keyed on the leading
-- `family_id` path segment (paths are family_id/instance_id/submission_id.<ext>,
-- src/adapters/storage/path.ts). Mirrors the table RLS in 0001_accounts.sql via
-- private.is_family_member, so a parent JWT can only ever read/write its own
-- family's objects — a DB-level guarantee, not just correct app-side paths.
--
-- Defense-in-depth: today uploads go through the server-only service-role client
-- (which BYPASSES RLS) and viewing is via short-lived signed URLs (pre-authorized,
-- not subject to these policies), so service-role + signed-URL paths are
-- unaffected. These policies gate any future direct anon/authenticated-key access.

-- storage.objects already has RLS enabled (managed by Supabase). Add scoped
-- policies for the authenticated role; drop-if-exists keeps this re-runnable.
drop policy if exists chore_photos_select on storage.objects;
drop policy if exists chore_photos_insert on storage.objects;
drop policy if exists chore_photos_update on storage.objects;
drop policy if exists chore_photos_delete on storage.objects;

create policy chore_photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chore-photos'
    and private.is_family_member(split_part(name, '/', 1))
  );

create policy chore_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chore-photos'
    and private.is_family_member(split_part(name, '/', 1))
  );

create policy chore_photos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'chore-photos'
    and private.is_family_member(split_part(name, '/', 1))
  )
  with check (
    bucket_id = 'chore-photos'
    and private.is_family_member(split_part(name, '/', 1))
  );

create policy chore_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'chore-photos'
    and private.is_family_member(split_part(name, '/', 1))
  );
