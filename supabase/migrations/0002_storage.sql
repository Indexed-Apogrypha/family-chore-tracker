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

insert into storage.buckets (id, name, public)
values ('chore-photos', 'chore-photos', false)
on conflict (id) do nothing;
