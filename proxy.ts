import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Next.js 16 `proxy` (the renamed `middleware`): refreshes the Supabase auth
 * session cookie on every request. Server Components can't write cookies, so this
 * is the single refresh point that keeps an access token from going stale
 * mid-render. It is a NO-OP when auth isn't configured — the keyless/legacy mode
 * has no sessions — so the app still runs with nothing set here and in CI.
 *
 * It never gates routing: page-level `requireUser()` / `requireParent()` /
 * `requireChild()` own all redirects (see `lib/server/auth.ts`). `proxy` runs on
 * the Node.js runtime (its only runtime), which suits the Supabase SDK + cookies.
 */
export async function proxy(request: NextRequest) {
  const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(toSet) {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  // Touch the session so an expired access token is refreshed into the response
  // cookies before any Server Component reads it.
  await supabase.auth.getUser();
  return response;
}

export const config = {
  // Everything except static assets + the manifest/icon.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)'],
};
