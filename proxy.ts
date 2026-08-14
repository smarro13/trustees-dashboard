import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { resolveRole, hasRequiredRole, getRequiredRoleForPath } from './lib/roles';

export async function proxy(req: NextRequest) {
  const forceLogout = (process.env.FORCE_DASHBOARD_LOGOUT || '').toLowerCase() === 'true';

  let response = NextResponse.next({
    request: {
      headers: req.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          req.cookies.set({
            name,
            value,
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: req.headers,
            },
          });
          response.cookies.set({
            name,
            value,
            ...options,
          });
        },
        remove(name: string, options: CookieOptions) {
          req.cookies.set({
            name,
            value: '',
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: req.headers,
            },
          });
          response.cookies.set({
            name,
            value: '',
            ...options,
          });
        },
      },
    }
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const publicRoutes = [
    '/auth/login',
    '/auth/callback',
    '/auth/forgot-password',
    '/auth/reset-password',
    '/public',
    '/public/actions',
    '/public/minutes',
    '/public/agm-minutes',
  ];
  const isPublicRoute = publicRoutes.some(route => req.nextUrl.pathname.startsWith(route));

  if (!session && !isPublicRoute) {
    const redirectUrl = new URL('/auth/login', req.url);
    return NextResponse.redirect(redirectUrl);
  }

  // Emergency switch to force re-authentication so new role claims are picked up.
  if (session && forceLogout && !req.nextUrl.pathname.startsWith('/auth/')) {
    const redirectUrl = new URL('/auth/login', req.url);
    const logoutResponse = NextResponse.redirect(redirectUrl);

    // Clear known Supabase auth cookies.
    logoutResponse.cookies.set('sb-access-token', '', { path: '/', maxAge: 0 });
    logoutResponse.cookies.set('sb-refresh-token', '', { path: '/', maxAge: 0 });
    logoutResponse.cookies.set('sb:token', '', { path: '/', maxAge: 0 });

    // Best-effort cleanup for project-ref cookie names.
    for (const cookie of req.cookies.getAll()) {
      if (cookie.name.startsWith('sb-') || cookie.name.startsWith('sb:')) {
        logoutResponse.cookies.set(cookie.name, '', { path: '/', maxAge: 0 });
      }
    }

    return logoutResponse;
  }

  if (session && req.nextUrl.pathname === '/auth/login') {
    const redirectUrl = new URL('/', req.url);
    return NextResponse.redirect(redirectUrl);
  }

  if (session) {
    const requiredRole = getRequiredRoleForPath(req.nextUrl.pathname);

    if (requiredRole) {
      const { data: userResult } = await supabase.auth.getUser();
      const effectiveRole = resolveRole(userResult.user);

      if (!hasRequiredRole(effectiveRole, requiredRole)) {
        const redirectUrl = new URL('/', req.url);
        redirectUrl.searchParams.set('access', 'denied');
        return NextResponse.redirect(redirectUrl);
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
