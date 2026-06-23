-- 0002_storage.sql — M3 "Submission & photos".
--
-- Provisions the private `chore-photos` storage bucket. Photos are stored at
-- family_id/instance_id/submission_id.<ext> (design §9, src/adapters/storage/path.ts).
--
-- Access model (§9): uploads go through the server-only SERVICE-ROLE client,
-- which bypasses storage RLS, and viewing uses short-lived SIGNED URLs. The
-- bucket is private (public = false) and no anon/authenticated policies are
-- granted, so storage is default-deny except to service-role — which only ever
-- signs the acting family's own paths. (Per-path RLS keyed on family_id is a
-- future hardening for any direct anon-key storage access.)

-- Defense-in-depth backstop to the route's own size/MIME checks: cap uploads at
-- 10 MB and restrict to image types (matching src/adapters/storage/path.ts).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chore-photos', 'chore-photos', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
