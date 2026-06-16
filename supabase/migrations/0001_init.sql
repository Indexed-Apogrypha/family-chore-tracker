-- 0001_init.sql — Family Chore Tracker: the four DATA tables behind the
-- persistence ports (ChoreStore / ReferenceStore / SubmissionStore).
--
-- DEFERRED to a later accounts slice: the `families` and `users` tables, Auth,
-- and per-family RLS POLICIES. `family_id` is present on every row here as an
-- INERT seam (nullable, no FK yet) so that slice can add the families table +
-- FK + policies without a data migration. The server uses the service-role key,
-- which BYPASSES RLS — so RLS is ENABLED here with NO policies: the adapters
-- work unconditionally, while any future anon/authenticated client is
-- deny-by-default rather than wide open (the honest posture).
--
-- Image BYTES live in Supabase Storage; rows carry only the object path + mime
-- type. Create the (private) Storage bucket out-of-band — this migration does
-- not create buckets. The bucket name must match SUPABASE_STORAGE_BUCKET.

create extension if not exists pgcrypto; -- gen_random_uuid()

-- chores ---------------------------------------------------------------------
create table chores (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  family_id  uuid,                       -- DEFERRED RLS seam (no FK yet)
  created_at timestamptz not null default now()
);
-- list() / find-or-create seeding read oldest->newest.
create index chores_created_at_idx on chores (created_at);

-- chore_references -----------------------------------------------------------
-- Versioned reference photos (PRD User Story 5: update without losing the old).
create table chore_references (
  id           uuid        primary key default gen_random_uuid(),
  chore_id     uuid        not null references chores (id),
  storage_path text        not null,     -- object key in the storage bucket
  mime_type    text        not null,     -- IANA, e.g. image/jpeg
  is_current   boolean     not null default true,
  family_id    uuid,                      -- DEFERRED RLS seam
  created_at   timestamptz not null default now()
);
create index chore_references_chore_id_idx on chore_references (chore_id, created_at);
-- THE invariant, enforced in the DB: at most one current reference per chore.
-- The system (referenceService) owns demotion; this index is the backstop.
create unique index chore_references_one_current_idx
  on chore_references (chore_id) where is_current;

-- submissions ----------------------------------------------------------------
create table submissions (
  id           uuid        primary key default gen_random_uuid(),
  chore_id     uuid        not null references chores (id),
  child_id     text,                      -- opaque key; child accounts deferred
  storage_path text        not null,
  mime_type    text        not null,
  exif         jsonb,                     -- captured-but-unused; null when none
  family_id    uuid,                      -- DEFERRED RLS seam
  created_at   timestamptz not null default now()
);
create index submissions_chore_id_idx on submissions (chore_id, created_at);

-- verdicts -------------------------------------------------------------------
-- No denormalized chore_id: listVerdicts(choreId) JOINs through submissions.
create table verdicts (
  id                uuid             primary key default gen_random_uuid(),
  submission_id     uuid             not null references submissions (id),
  result            text             not null,  -- 'pass' | 'fail'
  status            text             not null,  -- 'confirmed' | 'needs_review'
  confidence        double precision not null,
  matches_reference boolean          not null,
  deviations        jsonb            not null,  -- Deviation[]
  notes             text             not null,
  model             text             not null,
  judgment          jsonb            not null,  -- raw validated ModelJudgment
  family_id         uuid,                        -- DEFERRED RLS seam
  created_at        timestamptz      not null default now()
);
create index verdicts_submission_id_idx on verdicts (submission_id);

-- set_current_reference ------------------------------------------------------
-- Atomic demote+insert for a chore's current reference, in ONE transaction.
-- referenceService.setReference also pre-demotes via setCurrent before calling
-- the adapter's add() (which routes here); that pre-demote is a harmless
-- idempotent UPDATE, and this function does NOT depend on it — it demotes again
-- itself, so the partial unique index above can never be violated mid-sequence,
-- even under concurrent callers. This is the "transaction + partial unique
-- index" the in-memory fake can't provide, achieved without changing the seam.
-- Takes an explicit p_id so the row id matches the Storage object path.
create or replace function set_current_reference(
  p_id           uuid,
  p_chore_id     uuid,
  p_storage_path text,
  p_mime_type    text
) returns chore_references
language plpgsql
as $$
declare
  inserted chore_references;
begin
  update chore_references
     set is_current = false
   where chore_id = p_chore_id and is_current;   -- demote prior current (if any)

  insert into chore_references (id, chore_id, storage_path, mime_type, is_current)
  values (p_id, p_chore_id, p_storage_path, p_mime_type, true)
  returning * into inserted;

  return inserted;
end;
$$;

-- RLS: enable everywhere, add NO policies (service-role bypasses; anon/auth
-- denied by default until the accounts slice adds family-scoped policies).
alter table chores           enable row level security;
alter table chore_references enable row level security;
alter table submissions      enable row level security;
alter table verdicts         enable row level security;
