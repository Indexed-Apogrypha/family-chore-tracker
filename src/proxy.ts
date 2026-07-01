import { type NextRequest, NextResponse } from "next/server";

import { isRealMode } from "@/composition/env";
import { createSupabaseServerClient } from "@/composition/supabase";

/** State-changing methods that must prove they came from our own origin. */
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Cross-origin check (CSRF defense-in-depth on top of `SameSite=Lax` cookies):
 * browsers attach `Origin` to cross-origin requests, so a mutating request whose
 * `Origin` doesn't match our own host is rejected. Requests **without** an
 * `Origin` header pass — same-origin fetches may omit it and non-browser
 * clients (curl, tests) don't send one; they aren't riding a victim's cookies.
 */
function isCrossOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = (
    request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? ""
  )
    .split(",")[0]
    .trim();
  try {
    return new URL(origin).host !== host;
  } catch {
    return true; // `Origin: null` or malformed — treat as cross-origin
  }
}

/**
 * Proxy (Next 16's renamed `middleware` convention):
 *
 * 1. Reject cross-origin mutations (CSRF backstop) before any handler runs.
 * 2. Keep the Supabase auth session fresh on every request (design §3.1). Uses
 *    `getUser()` — which revalidates the JWT against the auth server — not
 *    `getSession()`, the documented secure pattern. Refreshed tokens are
 *    written back onto the response cookies.
 *
 * In keyless practice mode there is no Supabase project to talk to (and no anon
 * keys to build a client with), so step 2 is a no-op — practice sessions live in
 * the app's own cookies, not a Supabase JWT.
 */
export async function proxy(request: NextRequest) {
  if (MUTATING_METHODS.has(request.method) && isCrossOrigin(request)) {
    return NextResponse.json({ error: "cross_origin" }, { status: 403 });
  }

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
