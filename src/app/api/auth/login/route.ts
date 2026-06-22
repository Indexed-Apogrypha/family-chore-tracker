import { cookies } from "next/headers";

import { memberContext } from "@/app-session/context";
import { buildPorts } from "@/composition/container";
import { createSupabaseServerClient } from "@/composition/supabase";
import { findActingParent } from "@/usecases/auth";

/**
 * Parent login (design §3.1, §8.3). Authenticates against Supabase Auth, then
 * resolves the acting parent member and returns the request context the rest of
 * the app runs on. `409 no_family` means the account exists but has no family yet
 * (needs the signup bootstrap).
 */
export async function POST(request: Request): Promise<Response> {
  const { email, password } = (await request.json()) as {
    email?: string;
    password?: string;
  };
  if (!email || !password) {
    return Response.json({ error: "missing_fields" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createSupabaseServerClient({
    getAll: () => cookieStore.getAll(),
    setAll: (cookiesToSet) => {
      for (const { name, value, options } of cookiesToSet) {
        cookieStore.set(name, value, options);
      }
    },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) {
    return Response.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const parent = await findActingParent(buildPorts(), data.user.id);
  if (!parent.ok) {
    return Response.json({ error: "no_family" }, { status: 409 });
  }
  return Response.json({ ok: true, ctx: memberContext(parent.value) });
}
