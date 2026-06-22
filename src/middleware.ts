import { type NextRequest, NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/composition/supabase";

/**
 * Keep the Supabase auth session fresh on every request (design §3.1). Uses
 * `getUser()` — which revalidates the JWT against the auth server — not
 * `getSession()`, the documented secure pattern. Refreshed tokens are written
 * back onto the response cookies.
 */
export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });
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
