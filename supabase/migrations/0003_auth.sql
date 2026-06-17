-- 0003_auth.sql — Family Chore Tracker: the AUTH-layer activations.
--
-- Builds ON 0002_accounts.sql (families/users + family-level RLS policies). The
-- app slice that ships with this migration adds real Supabase Auth, login/sign-up,
-- the parent-provisioned child flow, PWA role gating, and the service-role ->
-- authenticated-client FLIP that finally makes the 0002 policies enforce (they
-- were dormant under the service role, which bypasses RLS). This migration adds
-- the two DB pieces that flip needs:
--
--   1. users.username — a child's login handle. Children have no email (PRD:40,
--      parent-provisioned, no self-registration), so the app derives a synthetic
--      auth email from the username; parents authenticate by their real email and
--      leave username NULL.
--   2. CHILD-RECORD-LEVEL scoping (PRD:41 "children see only their OWN records"):
--      tighten the submissions/verdicts policies so a child sees/inserts only their
--      own rows, while a parent still sees the whole family. 0002 delivered
--      family-level isolation; this adds the per-child tightening it deferred.
--
-- Still service-role-bypassed until the app flips to the authenticated client;
-- these are correct-by-construction now and activate at that flip.

-- username -------------------------------------------------------------------
-- Nullable + UNIQUE: parents have NULL (login by email); each child's handle is
-- globally unique because the derived auth email (username@<domain>) must be. The
-- users table is EMPTY in this slice (no auth.users until Auth provisions them),
-- so adding the column + unique index is a no-op on existing data.
alter table users add column username text;
create unique index users_username_key on users (username);

-- private.auth_role(): the role companion to private.auth_family_id() (0002). Same
-- recursion-breaker shape — SECURITY DEFINER reads `users` with RLS off, STABLE,
-- search_path = '' (fully schema-qualified body). Returns NULL for the service role
-- / pre-auth callers, so the role comparisons below are simply false for them.
create or replace function private.auth_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.role from public.users u where u.id = (select auth.uid());
$$;

-- submissions: replace the 0002 family-level policies with child-scoped ones.
-- SELECT: parent sees the whole family; a child sees only rows attributed to them.
-- INSERT: a child may only write rows attributed to themselves (child_id = own uid);
-- parents don't submit, so no parent INSERT path is needed.
drop policy if exists submissions_select_family on submissions;
drop policy if exists submissions_insert_family on submissions;

create policy submissions_select_scoped on submissions for select to authenticated
  using (
    family_id = (select private.auth_family_id())
    and (
      (select private.auth_role()) = 'parent'
      or child_id = (select auth.uid())::text
    )
  );
create policy submissions_insert_scoped on submissions for insert to authenticated
  with check (
    family_id = (select private.auth_family_id())
    and child_id = (select auth.uid())::text
  );
-- (UPDATE on submissions stays absent — submissions are append-only in v1.)

-- verdicts: a child sees verdicts for their OWN submissions; a parent sees the
-- family's. INSERT stays family-level (0002): the verdict for a child's submission
-- is written inside that child's own request, so family_id already matches.
drop policy if exists verdicts_select_family on verdicts;

create policy verdicts_select_scoped on verdicts for select to authenticated
  using (
    family_id = (select private.auth_family_id())
    and (
      (select private.auth_role()) = 'parent'
      or exists (
        select 1 from submissions s
        where s.id = verdicts.submission_id
          and s.child_id = (select auth.uid())::text
      )
    )
  );
