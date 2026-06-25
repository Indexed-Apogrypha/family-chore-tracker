-- 0008_record_decision_and_advance.sql — tech-debt #136.
--
-- Atomic parent decision (design §7.1, §8.1) — the app's one authoritative path.
-- decide() performed three sequential writes — record the decision on the
-- submission, advance the chore instance, and (on approve) credit points — with
-- no transaction. On the real adapter a fault between them leaves inconsistent
-- state in the authoritative path: a submission 'approved' with NO points
-- credited, or an instance not advanced. The idempotent ledger bounds *double*-
-- credit but not *partial*-commit, and a retry can't repair it (decide() refuses
-- a submission that is no longer 'pending_review').
--
-- Fold all three writes into one transaction, mirroring 0007's posture:
-- SECURITY DEFINER, locked search_path, granted to service_role only (the
-- server-only client the app uses). Family-scoped, like every other write.
-- Points + assignee are read from the instance row (the snapshot is the source
-- of truth at decision time, §7.1), and the ledger insert is idempotent on
-- submission_id (ON CONFLICT DO NOTHING) — so a replay never double-credits.

create or replace function public.record_decision_and_advance(
  p_family_id     text,
  p_submission_id text,
  p_instance_id   text,
  p_status        text,
  p_decided_by    text,
  p_decided_at    timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_points integer;
  v_member text;
begin
  if p_status not in ('approved', 'rejected') then
    raise exception 'record_decision_and_advance: invalid status %', p_status;
  end if;

  update public.submissions
     set status     = p_status,
         decided_by = p_decided_by,
         decided_at = p_decided_at
   where id = p_submission_id
     and family_id = p_family_id;

  -- Reject recycles the instance to 'todo' for a fresh attempt; approve marks it
  -- 'approved' (chore_instances has no 'rejected' state, §7.1). RETURNING gives
  -- us the snapshotted points + assignee to credit, in the same statement.
  update public.chore_instances
     set status = case when p_status = 'approved' then 'approved' else 'todo' end
   where id = p_instance_id
     and family_id = p_family_id
   returning points, assigned_member_id into v_points, v_member;

  -- Credit the kid exactly once on approve, derived from the instance snapshot.
  -- ON CONFLICT (submission_id) DO NOTHING is the "+points once" guarantee, so a
  -- replayed decision is a no-op rather than a double-credit (§6, §7.1).
  if p_status = 'approved' and v_points is not null then
    insert into public.points_ledger (family_id, member_id, submission_id, delta, reason)
    values (p_family_id, v_member, p_submission_id, v_points, 'chore_approved')
    on conflict (submission_id) do nothing;
  end if;
end;
$$;

revoke all on function public.record_decision_and_advance(text, text, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_decision_and_advance(text, text, text, text, text, timestamptz)
  to service_role;
