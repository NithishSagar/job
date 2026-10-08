import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from '@/lib/supabase/env';

/**
 * Keeps the Supabase session cookies fresh on every request and guards
 * everything under /dashboard.
 *
 * Implemented with the current @supabase/ssr `getAll` / `setAll` contract:
 * refreshed tokens are written onto the outgoing response (including when we
 * redirect), and the cache-control headers Supabase asks for are forwarded so
 * a CDN never caches one user's session for another.
 */
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Without env vars there is no session to validate. Fail open so the app can
  // still boot and render its "Supabase not configured" notice.
  if (!isSupabaseConfigured) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        Object.entries(headers ?? {}).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
      },
    },
  });

  // IMPORTANT: must run before any response is generated so a token refresh
  // can still be written to cookies.
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    // Network/config failure: treat as unauthenticated rather than 500-ing.
    user = null;
  }

  const isProtected = pathname.startsWith('/dashboard');
  const isAuthPage = pathname === '/login';

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('next', `${pathname}${search}`);
    return redirectWithCookies(url, response);
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    const next = request.nextUrl.searchParams.get('next');
    url.pathname = next && next.startsWith('/') ? next.split('?')[0] : '/dashboard/jobs';
    url.search = '';
    return redirectWithCookies(url, response);
  }

  return response;
}

/** Redirect while preserving any auth cookies Supabase just refreshed. */
function redirectWithCookies(url: URL, carrier: NextResponse) {
  const redirect = NextResponse.redirect(url);
  carrier.cookies.getAll().forEach((cookie) => {
    redirect.cookies.set(cookie);
  });
  carrier.headers.forEach((value, key) => {
    if (key.toLowerCase().startsWith('cache-control') || key.toLowerCase() === 'pragma') {
      redirect.headers.set(key, value);
    }
  });
  return redirect;
}

export const config = {
  matcher: [
    /*
     * Run on every path except Next internals and static assets, so the
     * session cookie is refreshed while the user browses.
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
};
