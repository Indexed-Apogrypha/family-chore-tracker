# Reclaiming orphaned `chore-photos` blobs

`submitPhoto` stores the photo **before** the `submissions` row exists — the
photo path is keyed on the submission id, and the spec orders `put` before
`create` (design §7.2, §9). If persistence faults between those two steps, the
upload succeeds but no row is ever written, leaving a **stored blob with no
referencing submission**.

This is a reclaimable orphan, not a correctness bug: the orphaned object is never
served (signed URLs are only minted for live submissions), it just consumes
storage. The infra fault itself is surfaced to the caller as
`storage_unavailable` / `persistence_unavailable` (#112), so the user retries and
gets a fresh, fully-committed submission.

The app's scale doesn't justify a live cron, so reclamation is a **documented,
runnable sweep** rather than an always-on job.

## 1. Identify orphans (read-only)

An object under `chore-photos` is an orphan when its `name` (the storage path,
`family_id/instance_id/submission_id.<ext>`) matches no `submissions.photo_path`:

```sql
select o.name, o.created_at
from storage.objects o
where o.bucket_id = 'chore-photos'
  and not exists (
    select 1 from public.submissions s where s.photo_path = o.name
  )
  -- grace window: ignore very recent uploads that may still be mid-commit
  and o.created_at < now() - interval '1 hour'
order by o.created_at;
```

## 2. Reclaim

Delete the identified objects with the **server-only service-role** client (it
bypasses storage RLS), so the physical files are removed, not just the rows:

```ts
// scripts/gc-chore-photos.ts (run manually; needs SUPABASE_URL + SERVICE_ROLE_KEY)
import { createServiceRoleClient } from "@/composition/supabase";

const client = createServiceRoleClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// `orphans` = the `name`s returned by the query in §1.
const orphans: string[] = [/* … */];
if (orphans.length) {
  const { error } = await client.storage.from("chore-photos").remove(orphans);
  if (error) throw error;
}
```

A direct `delete from storage.objects where …` (the §1 predicate) also works via
the SQL editor / MCP for a one-off cleanup, but prefer the storage API for
batch removal so Supabase reclaims the underlying files.

## Future

If submission volume ever grows, promote this to a scheduled job (e.g. `pg_cron`
calling an Edge Function that runs §1 → §2). Until then, run it ad hoc if storage
usage looks high.
