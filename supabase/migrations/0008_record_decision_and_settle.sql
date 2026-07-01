-- 0008_record_decision_and_settle.sql — tech-debt follow-up (#136).
--
-- Atomic parent decision (design §7.1): record the authoritative decision on
-- the submission, move its chore instance (approve → 'approved'; reject
-- recycles to 'todo' — chore_instances has no 'rejected' state), and, on
-- approve, append the points-ledger credit — all in ONE transaction, so an
-- infra fault can't leave a submission 'approved' with no points credited or
-- an instance that never advanced. The credit stays idempotent on
-- submission_id (the ledger's unique key), so a replayed settle never
-- double-credits.
--
-- Mirrors record_verdict_and_advance's posture (0007): SECURITY DEFINER,
-- locked search_path, granted to service_role only (the server-only client
-- the app uses). Family-scoped, like every other write.

create or replace function public.record_decision_and_settle(
  p_family_id        text,
  p_submission_id    text,
  p_instance_id      text,
  p_status           text,        -- 'approved' | 'rejected'
  p_decided_by       text,
  p_decided_at       timestamptz,
  p_credit_member_id text default null,
  p_credit_delta     integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.submissions
     set status     = p_status,
         decided_by = p_decided_by,
         decided_at = p_decided_at
   where id = p_submission_id
     and family_id = p_family_id;
  update public.chore_instances
     set status = case when p_status = 'approved' then 'approved' else 'todo' end
   where id = p_instance_id
     and family_id = p_family_id;
  if p_credit_member_id is not null and p_credit_delta is not null then
    insert into public.points_ledger
      (family_id, member_id, submission_id, delta, reason, created_at)
    values
      (p_family_id, p_credit_member_id, p_submission_id, p_credit_delta,
       'chore_approved', p_decided_at)
    on conflict (submission_id) do nothing;
  end if;
end;
$$;

revoke all on function public.record_decision_and_settle(
  text, text, text, text, text, timestamptz, text, integer
) from public, anon, authenticated;
grant execute on function public.record_decision_and_settle(
  text, text, text, text, text, timestamptz, text, integer
) to service_role;
