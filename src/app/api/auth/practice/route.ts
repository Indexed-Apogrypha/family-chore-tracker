import { isRealMode } from "@/composition/env";
import { setPracticeSession } from "@/composition/request";
import { serverPorts } from "@/composition/server";
import { seedPracticeFamily } from "@/composition/session";

/**
 * Enter keyless **practice** mode (design §9 keyless path). Bootstraps an
 * in-memory family with a founding parent and one demo kid, then anchors this
 * device to it via the practice cookies — no Supabase account needed. Disabled
 * in real mode, where accounts come from Supabase signup/login.
 */
export async function POST(): Promise<Response> {
  if (isRealMode()) {
    return Response.json({ error: "not_in_practice_mode" }, { status: 400 });
  }
  const { family, founder } = await seedPracticeFamily(serverPorts());
  await setPracticeSession(family.id, founder.id);
  return Response.json({ ok: true });
}
