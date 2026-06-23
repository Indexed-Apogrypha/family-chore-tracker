-- 0004_rls_chores_submissions_points.sql — M6 "Data → cloud" (#75).
--
-- Per-family RLS (defense-in-depth) on the M6 tables, keyed on `family_id` via
-- the parent JWT — reusing `private.is_family_member` from 0001. The v1 runtime
-- guard remains the server-only **service-role** adapter (which BYPASSES RLS)
-- plus always-on app-layer family scoping; these policies guard any future
-- anon/authenticated-key path (the two-layer model, §9).

alter table public.chore_templates enable row level security;
alter table public.chore_instances enable row level security;
alter table public.submissions     enable row level security;
alter table public.points_ledger   enable row level security;

-- chore_templates
create policy chore_templates_select on public.chore_templates
  for select to authenticated using (private.is_family_member(family_id));
create policy chore_templates_insert on public.chore_templates
  for insert to authenticated with check (private.is_family_member(family_id));
create policy chore_templates_update on public.chore_templates
  for update to authenticated
  using (private.is_family_member(family_id))
  with check (private.is_family_member(family_id));

-- chore_instances
create policy chore_instances_select on public.chore_instances
  for select to authenticated using (private.is_family_member(family_id));
create policy chore_instances_insert on public.chore_instances
  for insert to authenticated with check (private.is_family_member(family_id));
create policy chore_instances_update on public.chore_instances
  for update to authenticated
  using (private.is_family_member(family_id))
  with check (private.is_family_member(family_id));

-- submissions
create policy submissions_select on public.submissions
  for select to authenticated using (private.is_family_member(family_id));
create policy submissions_insert on public.submissions
  for insert to authenticated with check (private.is_family_member(family_id));
create policy submissions_update on public.submissions
  for update to authenticated
  using (private.is_family_member(family_id))
  with check (private.is_family_member(family_id));

-- points_ledger — append-only, so select + insert only (no update path)
create policy points_ledger_select on public.points_ledger
  for select to authenticated using (private.is_family_member(family_id));
create policy points_ledger_insert on public.points_ledger
  for insert to authenticated with check (private.is_family_member(family_id));
