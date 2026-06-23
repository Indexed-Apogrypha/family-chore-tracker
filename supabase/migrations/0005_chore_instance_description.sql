-- 0005_chore_instance_description.sql — M6 follow-up (#115).
--
-- Snapshot the chore's description onto generated instances so the vision judge
-- can use it. `chore_templates` already carries an optional `description`, and
-- the judge prompt (src/adapters/judge/verdict.ts) already incorporates one, but
-- `chore_instances` never stored it — so the judge only ever saw the title.
--
-- Additive + nullable: one-offs (no template) and pre-existing rows simply have
-- no description, so this is backward-compatible with the deployed app.

alter table public.chore_instances
  add column if not exists description text;
