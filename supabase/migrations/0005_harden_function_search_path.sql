-- 0005_harden_function_search_path.sql
--
-- Hardening surfaced by the live smoke's security advisor
-- (lint 0011_function_search_path_mutable): `set_current_reference` had a role-
-- mutable `search_path`. A function that resolves unqualified names against the
-- caller's `search_path` is a footgun under authenticated callers (auth mode
-- invokes this RPC through the authenticated client), so pin it and fully-qualify.
--
-- Re-creates the 5-arg `set_current_reference` (the one the adapter calls, with
-- p_family_id) with `set search_path = ''` + schema-qualified names. Behavior is
-- unchanged — same atomic demote-prior-current + insert-new-current, still backed
-- by the `chore_references_one_current_idx` partial unique index. SECURITY INVOKER
-- is retained (the function must run with the caller's privileges so per-family
-- RLS still applies in auth mode).
--
-- Also drops the orphaned 4-arg overload from 0001 (pre-family_id) if present: a
-- fresh 0001->0002 apply leaves it behind because 0002's `create or replace` has a
-- new signature, so it never replaced it. It is dead (no caller passes 4 args) and
-- would itself trip the same lint. `if exists` makes this a no-op where it is
-- already absent (as on the live project, which only carries the 5-arg version).

drop function if exists public.set_current_reference(uuid, uuid, text, text);

create or replace function public.set_current_reference(
  p_id           uuid,
  p_chore_id     uuid,
  p_storage_path text,
  p_mime_type    text,
  p_family_id    uuid
) returns public.chore_references
language plpgsql
set search_path = ''
as $$
declare
  inserted public.chore_references;
begin
  update public.chore_references
     set is_current = false
   where chore_id = p_chore_id
     and is_current
     and family_id is not distinct from p_family_id;   -- demote prior current

  insert into public.chore_references (id, chore_id, storage_path, mime_type, is_current, family_id)
  values (p_id, p_chore_id, p_storage_path, p_mime_type, true, p_family_id)
  returning * into inserted;

  return inserted;
end;
$$;
