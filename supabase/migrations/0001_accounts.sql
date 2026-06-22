-- 0001_accounts.sql — M1 "Accounts & profiles".
--
-- Rebuilds the public schema after the repo reset: drops the abandoned pre-reset
-- app's tables, then creates `families` + `members` matching the current domain
-- model (src/domain/family/types.ts).
--
-- IDs are TEXT: the domain treats ids as opaque branded strings, and the shared
-- MemberRepository contract pokes them with synthetic values — TEXT keeps the
-- Supabase adapter passing that contract unchanged (no uuid-cast special-casing).
-- The DB still generates uuid-shaped ids via gen_random_uuid()::text.
--
-- RLS is enabled as DEFENSE-IN-DEPTH. The v1 runtime enforcer is the server-only
-- service-role adapter, which scopes every query by family_id (mirrored by the
-- in-memory adapter the contract proves). Service-role BYPASSES RLS by design;
-- these policies guard any future anon-key path.

-- ---------------------------------------------------------------------------
-- 0. Drop the abandoned pre-reset app's tables (CASCADE clears dependent FKs).
-- ---------------------------------------------------------------------------
drop table if exists public.verdicts         cascade;
drop table if exists public.submissions      cascade;
drop table if exists public.chore_references cascade;
drop table if exists public.chores           cascade;
drop table if exists public.users            cascade;
drop table if exists public.families         cascade;

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
create table public.families (
  id          text primary key default gen_random_uuid()::text,
  name        text not null check (length(btrim(name)) between 1 and 100),
  -- The founding parent member. App-enforced (no FK) so the in-memory and
  -- Supabase adapters behave identically; avoids a circular FK with members.
  created_by  text not null,
  created_at  timestamptz not null default now()
);

create table public.members (
  id            text primary key default gen_random_uuid()::text,
  family_id     text not null references public.families(id) on delete cascade,
  kind          text not null check (kind in ('parent', 'kid')),
  display_name  text not null check (length(btrim(display_name)) between 1 and 100),
  -- Parents are backed by a Supabase Auth user (id stored as text); kids are not.
  auth_user_id  text unique,
  -- Kids' hashed PIN (scrypt 'salt:hash'); parents have none.
  pin_hash      text,
  created_at    timestamptz not null default now(),
  -- A parent has an auth user and no pin; a kid has a pin and no auth user.
  constraint members_kind_shape check (
    (kind = 'parent' and pin_hash is null)
    or (kind = 'kid' and auth_user_id is null)
  )
);

-- Every read is family-scoped; the auth-user lookup is the login hot path.
create index members_family_id_idx on public.members (family_id);
create index members_auth_user_id_idx on public.members (auth_user_id)
  where auth_user_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Atomic family bootstrap — create a family + its founding parent in one
--    call. Generates both ids up front, so there is no circular dependency.
--    SECURITY DEFINER + pinned search_path (the spec's "bootstrap" path, §9).
-- ---------------------------------------------------------------------------
create or replace function public.create_family(
  p_name         text,
  p_founder_name text,
  p_auth_user_id text default null
)
returns table (family_id text, family_name text, founder_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family_id  text := gen_random_uuid()::text;
  v_founder_id text := gen_random_uuid()::text;
begin
  insert into public.families (id, name, created_by)
    values (v_family_id, p_name, v_founder_id);
  insert into public.members (id, family_id, kind, display_name, auth_user_id)
    values (v_founder_id, v_family_id, 'parent', p_founder_name, p_auth_user_id);
  return query select v_family_id, p_name, v_founder_id;
end;
$$;

revoke all on function public.create_family(text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_family(text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. RLS — defense-in-depth (service-role bypasses; guards any future anon path).
-- ---------------------------------------------------------------------------
alter table public.families enable row level security;
alter table public.members  enable row level security;

create schema if not exists private;

-- Recursion-safe membership check (SECURITY DEFINER so the members policy does
-- not re-invoke itself). auth_user_id is text, auth.uid() is uuid, so cast.
create or replace function private.is_family_member(p_family_id text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.members m
    where m.family_id = p_family_id
      and m.auth_user_id = (select auth.uid())::text
  );
$$;

revoke all on function private.is_family_member(text) from public, anon;
grant execute on function private.is_family_member(text) to authenticated;

create policy families_select on public.families
  for select to authenticated using (private.is_family_member(id));
create policy families_insert on public.families
  for insert to authenticated with check (private.is_family_member(id));
create policy families_update on public.families
  for update to authenticated
  using (private.is_family_member(id))
  with check (private.is_family_member(id));

create policy members_select on public.members
  for select to authenticated using (private.is_family_member(family_id));
create policy members_insert on public.members
  for insert to authenticated with check (private.is_family_member(family_id));
create policy members_update on public.members
  for update to authenticated
  using (private.is_family_member(family_id))
  with check (private.is_family_member(family_id));
