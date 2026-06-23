-- 0007_record_verdict_and_advance.sql — M6 follow-up (#112).
--
-- Atomic verdict + advance (design §7.2): attach the advisory AI verdict and
-- move BOTH the submission and its chore instance to 'pending_review' in a single
-- transaction, so an infra fault can't half-commit — leaving a verdict without an
-- advanced status, or the submission advanced while its instance lags.
--
-- Mirrors create_family's posture: SECURITY DEFINER, locked search_path, granted
-- to service_role only (the server-only client the app uses). Family-scoped, like
-- every other write.

create or replace function public.record_verdict_and_advance(
  p_family_id     text,
  p_submission_id text,
  p_instance_id   text,
  p_verdict       jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.submissions
     set ai_verdict = p_verdict,
         status     = 'pending_review'
   where id = p_submission_id
     and family_id = p_family_id;
  update public.chore_instances
     set status = 'pending_review'
   where id = p_instance_id
     and family_id = p_family_id;
end;
$$;

revoke all on function public.record_verdict_and_advance(text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_verdict_and_advance(text, text, text, jsonb)
  to service_role;
