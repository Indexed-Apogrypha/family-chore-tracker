-- 0002_accounts.sql — Family Chore Tracker: the ACCOUNTS foundation.
--
-- Adds the two account tables the PRD's six-table model held a seam for —
-- `families` and `users` — turns each data table's inert `family_id` column into
-- a real per-family foreign key, and installs the per-family RLS POLICIES that
-- 0001_init.sql deliberately left absent (it enabled RLS with ZERO policies).
--
-- IS:     the data-model + RLS-policy foundation, reviewable without live auth.
-- IS NOT: Supabase Auth, login/sign-up/sign-out, the parent-provisioned child
--         flow, PWA role gating, or the service-role -> authenticated client flip.
--         Those are a deferred follow-up; the app keeps using the service-role key
--         and a single seeded family.
--
-- BELT-AND-SUSPENDERS (read before judging the policies as dead code): the server
-- authenticates with the SERVICE-ROLE key, which BYPASSES RLS. So per-family
-- correctness TODAY comes from the adapters themselves, which now stamp `family_id`
-- on every write and filter every read by it. The RLS policies below are the
-- DORMANT-BUT-READY enforcement layer: inert under the service role, they become
-- the deny-by-default guard the moment the deferred auth slice swaps in an
-- authenticated (user-JWT) client. Both layers are intentional; neither is
-- redundant — delete the adapter filtering "because RLS exists" and tenancy breaks
-- silently under the service role.
--
-- EMPTY-USERS / OWNERLESS-FAMILY (honest posture): no `auth.users` exist without
-- Auth, so `users` is EMPTY in this slice and the seeded `families` row is
-- "ownerless" until the auth slice provisions a parent. Fine, because the service
-- role bypasses the (users-reading) policies; they are correct-by-construction now
-- and activate later.
--
-- family_id IS NULLABLE + FK (not NOT NULL) — deliberate: a fresh DB applying 0001
-- then 0002 has no rows, but a dev DB that already ran 0001 in Supabase mode has
-- family_id = NULL rows and no family to assign them to. A FK tolerates NULLs
-- (enforced only on non-null values), so existing rows survive while every NEW
-- (always-stamped) write is FK-checked. Promoting to NOT NULL needs a backfill
-- decision that belongs to the auth slice (assign legacy rows to the seeded
-- family, then SET NOT NULL in a later migration).

-- families -------------------------------------------------------------------
-- A household: the multi-tenancy root. v1 seeds exactly one (find-or-create in the
-- container). `name` is descriptive only.
create table families (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  created_at timestamptz not null default now()
);

-- users ----------------------------------------------------------------------
-- Account rows, one per Supabase Auth user. `id` IS the auth.users id (1:1), so a
-- row only exists once Auth has minted the user — EMPTY in this slice. Children are
-- parent-provisioned (PRD:40, no self-registration); both parent and child carry
-- the shared `family_id` that scopes RLS (PRD:41).
create table users (
  id         uuid        primary key references auth.users (id) on delete cascade,
  family_id  uuid        not null references families (id),
  role       text        not null check (role in ('parent', 'child')),
  created_at timestamptz not null default now()
);
create index users_family_id_idx on users (family_id);

-- family_id: inert seam -> real FK on every data table (kept nullable; see header).
alter table chores
  add constraint chores_family_id_fkey
  foreign key (family_id) references families (id);
alter table chore_references
  add constraint chore_references_family_id_fkey
  foreign key (family_id) references families (id);
alter table submissions
  add constraint submissions_family_id_fkey
  foreign key (family_id) references families (id);
alter table verdicts
  add constraint verdicts_family_id_fkey
  foreign key (family_id) references families (id);

-- Per-family read paths benefit from an index on the scoping column.
create index chores_family_id_idx           on chores (family_id);
create index chore_references_family_id_idx on chore_references (family_id);
create index submissions_family_id_idx      on submissions (family_id);
create index verdicts_family_id_idx         on verdicts (family_id);

-- private schema for SECURITY DEFINER helpers (never API-exposed) -------------
create schema if not exists private;

-- auth_family_id(): the recursion-breaker. A policy ON `users` that subqueries
-- `users` recurses forever; this SECURITY DEFINER function reads `users` with
-- DEFINER (table-owner) rights, so RLS does not re-apply inside it, and data-table
-- policies can ask "which family is the caller in?" without recursion. STABLE (one
-- value per statement) and `set search_path = ''` (cannot be shadowed; the body is
-- fully schema-qualified). Returns NULL when the caller has no users row (e.g. the
-- service role, or pre-auth) — and NULL on either side of `=` is never true, so such
-- callers are denied by every USING/CHECK below (deny-by-default), which is exactly
-- the posture we want.
create or replace function private.auth_family_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.family_id from public.users u where u.id = (select auth.uid());
$$;

-- set_current_reference: re-create with p_family_id. Adding a parameter changes the
-- signature, and `create or replace function` cannot change the argument list, so we
-- DROP the 0001 version then recreate. Now stamps `family_id` on the inserted
-- reference; the demote is family-scoped too (defense-in-depth; chore_id already
-- implies one family).
drop function if exists set_current_reference(uuid, uuid, text, text);

create or replace function set_current_reference(
  p_id           uuid,
  p_chore_id     uuid,
  p_storage_path text,
  p_mime_type    text,
  p_family_id    uuid
) returns chore_references
language plpgsql
as $$
declare
  inserted chore_references;
begin
  update chore_references
     set is_current = false
   where chore_id = p_chore_id
     and is_current
     and family_id is not distinct from p_family_id;   -- demote prior current

  insert into chore_references (id, chore_id, storage_path, mime_type, is_current, family_id)
  values (p_id, p_chore_id, p_storage_path, p_mime_type, true, p_family_id)
  returning * into inserted;

  return inserted;
end;
$$;

-- RLS POLICIES ---------------------------------------------------------------
-- The four data tables already have RLS ENABLED (0001) with no policies. Enable it
-- on the two new account tables, then add per-family policies everywhere. All target
-- the `authenticated` role; the service role bypasses RLS, so these are inert until
-- the auth-client flip. auth.uid() is wrapped as (select auth.uid()) for
-- per-statement caching.
alter table families enable row level security;
alter table users    enable row level security;

-- families: a user sees only their own family; no client-side writes (families are
-- created by the seeding path / a future server-side provisioning flow under the
-- service role, never by an authenticated end user).
create policy families_select_own on families for select to authenticated
  using (id = (select private.auth_family_id()));

-- users: AVOID self-recursion with two non-recursive reads — (a) always see your OWN
-- row by matching the JWT subject directly (no users subquery), and (b) see
-- same-family rows via the DEFINER helper (which reads users with RLS off).
create policy users_select_self on users for select to authenticated
  using (id = (select auth.uid()));
create policy users_select_same_family on users for select to authenticated
  using (family_id = (select private.auth_family_id()));
-- (No client INSERT/UPDATE on users: provisioning is parent-driven and lands in the
--  deferred auth slice, done server-side. Deny-by-default until then.)

-- chores: per-family select/insert/update. UPDATE uses USING + WITH CHECK so a row
-- can't be re-homed to another family.
create policy chores_select_family on chores for select to authenticated
  using (family_id = (select private.auth_family_id()));
create policy chores_insert_family on chores for insert to authenticated
  with check (family_id = (select private.auth_family_id()));
create policy chores_update_family on chores for update to authenticated
  using (family_id = (select private.auth_family_id()))
  with check (family_id = (select private.auth_family_id()));

-- chore_references: same per-family shape. (The atomic demote+insert runs inside
-- set_current_reference; once the client is authenticated, that function's writes are
-- still subject to these policies unless it too becomes SECURITY DEFINER — a knob to
-- revisit in the auth slice.)
create policy chore_references_select_family on chore_references for select to authenticated
  using (family_id = (select private.auth_family_id()));
create policy chore_references_insert_family on chore_references for insert to authenticated
  with check (family_id = (select private.auth_family_id()));
create policy chore_references_update_family on chore_references for update to authenticated
  using (family_id = (select private.auth_family_id()))
  with check (family_id = (select private.auth_family_id()));

-- submissions: family-level (US17). DEFERRED (auth slice): PRD:41 "children see only
-- their OWN records" needs auth.uid() -> submissions.child_id linkage (Auth + linking
-- child_id to users.id); it will tighten the child's USING to also match
-- child_id = auth.uid(). This slice delivers FAMILY-level isolation, fully expressible
-- now.
create policy submissions_select_family on submissions for select to authenticated
  using (family_id = (select private.auth_family_id()));
create policy submissions_insert_family on submissions for insert to authenticated
  with check (family_id = (select private.auth_family_id()));
create policy submissions_update_family on submissions for update to authenticated
  using (family_id = (select private.auth_family_id()))
  with check (family_id = (select private.auth_family_id()));

-- verdicts carry their own family_id (adapter-stamped), so policies are direct, not
-- join-through-submissions.
create policy verdicts_select_family on verdicts for select to authenticated
  using (family_id = (select private.auth_family_id()));
create policy verdicts_insert_family on verdicts for insert to authenticated
  with check (family_id = (select private.auth_family_id()));
create policy verdicts_update_family on verdicts for update to authenticated
  using (family_id = (select private.auth_family_id()))
  with check (family_id = (select private.auth_family_id()));
