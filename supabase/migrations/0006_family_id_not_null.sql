-- 0006_family_id_not_null.sql
-- Harden multi-tenancy: make `family_id` NOT NULL on the four data tables.
--
-- `family_id` was introduced *nullable* in 0002 (a non-breaking add to existing
-- tables). Every write path stamps it — the family-aware adapters
-- (Supabase{Chore,Reference,Submission}Store) on every insert — and the RLS
-- policies filter by it, so a NULL `family_id` would be an orphan row that
-- escapes tenancy entirely. This pins the invariant in the schema.
-- (`users.family_id` is already NOT NULL from 0002.)
--
-- The backfill is defensive + conditional: on a legacy single-family deploy any
-- pre-multi-tenancy orphan rows belonged to the one implicit family, so they are
-- adopted by the seeded "My Family" (find-or-create, mirroring
-- `ensureSeededFamily`). On a clean / already-tenanted database (no NULLs) it is a
-- no-op and no family is created.

do $$
declare
  fam uuid;
begin
  if exists (
    select 1 from public.chores            where family_id is null
    union all
    select 1 from public.chore_references  where family_id is null
    union all
    select 1 from public.submissions       where family_id is null
    union all
    select 1 from public.verdicts          where family_id is null
  ) then
    select id into fam from public.families where name = 'My Family' order by created_at limit 1;
    if fam is null then
      insert into public.families (name) values ('My Family') returning id into fam;
    end if;
    update public.chores           set family_id = fam where family_id is null;
    update public.chore_references set family_id = fam where family_id is null;
    update public.submissions      set family_id = fam where family_id is null;
    update public.verdicts         set family_id = fam where family_id is null;
  end if;
end $$;

alter table public.chores            alter column family_id set not null;
alter table public.chore_references  alter column family_id set not null;
alter table public.submissions       alter column family_id set not null;
alter table public.verdicts          alter column family_id set not null;
