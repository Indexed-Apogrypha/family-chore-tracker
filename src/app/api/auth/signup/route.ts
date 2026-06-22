import { cookies } from "next/headers";

import { serverPorts } from "@/composition/server";
import { createSupabaseServerClient } from "@/composition/supabase";

/**
 * Parent signup (design §3.1, §4.2). Creates a Supabase Auth user, then bootstraps
 * their family on first signup — the founder member carries `auth_user_id`, so
 * later logins resolve back to it. Service-role data access stays server-side.
 */
export async function POST(request: Request): Promise<Response> {
  const { email, password, familyName, displayName } = (await request.json()) as {
    email?: string;
    password?: string;
    familyName?: string;
    displayName?: string;
  };
  if (!email || !password || !familyName || !displayName) {
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

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error || !data.user) {
    return Response.json(
      { error: error?.message ?? "signup_failed" },
      { status: 400 },
    );
  }

  // First-login bootstrap: a brand-new parent has no family yet → create one.
  const ports = serverPorts();
  const existing = await ports.members.findByAuthUserId(data.user.id);
  if (!existing) {
    await ports.members.createFamily({
      name: familyName,
      founderDisplayName: displayName,
      authUserId: data.user.id,
    });
  }
  return Response.json({ ok: true });
}
