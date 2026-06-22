import { type NextRequest, NextResponse } from "next/server";

import { isRealMode } from "@/composition/env";
import { createSupabaseServerClient } from "@/composition/supabase";

/**
 * Keep the Supabase auth session fresh on every request (design §3.1). Uses
 * `getUser()` — which revalidates the JWT against the auth server — not
 * `getSession()`, the documented secure pattern. Refreshed tokens are written
 * back onto the response cookies.
 *
 * In keyless practice mode there is no Supabase project to talk to (and no anon
 * keys to build a client with), so this is a no-op — practice sessions live in
 * the app's own cookies, not a Supabase JWT.
 */
export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });
  if (!isRealMode()) return response;

  const supabase = createSupabaseServerClient({
    getAll: () => request.cookies.getAll(),
    setAll: (cookiesToSet) => {
      for (const { name, value, options } of cookiesToSet) {
        response.cookies.set(name, value, options);
      }
    },
  });
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
