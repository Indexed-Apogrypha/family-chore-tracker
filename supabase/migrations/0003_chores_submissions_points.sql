-- 0003_chores_submissions_points.sql — M6 "Data → cloud".
--
-- The chore/submission/points tables, completing the §6 data model. Mirrors the
-- in-memory adapters (the executable spec) so the shared repository contracts
-- rerun unchanged against Supabase. TEXT ids (opaque branded strings, like
-- 0001); every row carries `family_id` (the tenant key). Statuses are TEXT with
-- check constraints (matching the domain enums) rather than pg enums, so the
-- contract pokes them with plain strings.
--
-- RLS lands in 0004 (defense-in-depth). The runtime guard is the server-only
-- service-role adapter, which scopes every query by family_id.

-- ---------------------------------------------------------------------------
-- chore_templates
-- ---------------------------------------------------------------------------
create table public.chore_templates (
  id                 text primary key default gen_random_uuid()::text,
  family_id          text not null references public.families(id) on delete cascade,
  title              text not null check (length(btrim(title)) between 1 and 80),
  description        text,
  points             integer not null check (points > 0),
  recurrence         jsonb not null,
  assigned_member_id text not null references public.members(id) on delete cascade,
  active             boolean not null default true,
  created_at         timestamptz not null default now()
);
create index chore_templates_family_id_idx on public.chore_templates (family_id);

-- ---------------------------------------------------------------------------
-- chore_instances — snapshot title/points; no `rejected` state (§7.1)
-- ---------------------------------------------------------------------------
create table public.chore_instances (
  id                 text primary key default gen_random_uuid()::text,
  family_id          text not null references public.families(id) on delete cascade,
  -- Null for a one-off; set for a template-generated instance.
  template_id        text references public.chore_templates(id) on delete cascade,
  title              text not null,
  points             integer not null check (points > 0),
  assigned_member_id text not null references public.members(id) on delete cascade,
  due_date           date not null,
  status             text not null default 'todo'
    check (status in ('todo', 'evaluating', 'pending_review', 'approved')),
  created_at         timestamptz not null default now()
);
create index chore_instances_family_id_idx on public.chore_instances (family_id);
-- Lazy-generation idempotency (§6, §7.3): template-generated instances are unique
-- per (template, member, due_date). One-offs (template_id null) sit outside it.
create unique index chore_instances_generated_key
  on public.chore_instances (template_id, assigned_member_id, due_date)
  where template_id is not null;

-- ---------------------------------------------------------------------------
-- submissions — id is CALLER-minted (the photo path is keyed on it, §7.2, §9)
-- ---------------------------------------------------------------------------
create table public.submissions (
  id           text primary key,
  family_id    text not null references public.families(id) on delete cascade,
  instance_id  text not null references public.chore_instances(id) on delete cascade,
  submitted_by text not null references public.members(id) on delete cascade,
  photo_path   text not null,
  status       text not null default 'evaluating'
    check (status in ('evaluating', 'pending_review', 'approved', 'rejected')),
  ai_verdict   jsonb,
  decided_by   text references public.members(id) on delete set null,
  decided_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index submissions_family_id_idx on public.submissions (family_id);
create index submissions_family_status_idx on public.submissions (family_id, status);

-- ---------------------------------------------------------------------------
-- points_ledger — append-only; one credit per approved submission (§6, §7.1)
-- ---------------------------------------------------------------------------
create table public.points_ledger (
  id            text primary key default gen_random_uuid()::text,
  family_id     text not null references public.families(id) on delete cascade,
  member_id     text not null references public.members(id) on delete cascade,
  -- Uniqueness here is the "+points exactly once" guarantee.
  submission_id text not null unique references public.submissions(id) on delete cascade,
  delta         integer not null,
  reason        text not null check (reason = 'chore_approved'),
  created_at    timestamptz not null default now()
);
create index points_ledger_family_member_idx on public.points_ledger (family_id, member_id);
