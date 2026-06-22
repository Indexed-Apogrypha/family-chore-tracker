import { cookies } from "next/headers";

import { isRealMode } from "@/composition/env";
import { clearSession } from "@/composition/request";
import { createSupabaseServerClient } from "@/composition/supabase";

/**
 * Sign out: end the Supabase session in real mode, then clear the app-level
 * profile cookies. Idempotent — safe to call without an active session.
 */
export async function POST(): Promise<Response> {
  const cookieStore = await cookies();
  if (isRealMode()) {
    const supabase = createSupabaseServerClient({
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      },
    });
    await supabase.auth.signOut();
  }
  await clearSession();
  return Response.json({ ok: true });
}
