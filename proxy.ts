import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

type DashboardRole = 'admin' | 'management' | 'safeguarding' | 'commercial' | null;

const ROLE_RANK: Record<Exclude<DashboardRole, null>, number> = {
  admin: 4,
  management: 3,
  safeguarding: 2,
  commercial: 1,
};

const normalizeRole = (rawRole: unknown): DashboardRole => {
  if (typeof rawRole !== 'string') return null;

  const value = rawRole.trim().toLowerCase();
  if (!value) return null;

  if (value === 'admin') return 'admin';
  if (value === 'management' || value === 'mangement') return 'management';
  if (value === 'safeguarding') return 'safeguarding';
  if (value === 'commercial' || value === 'commerical') return 'commercial';

  return null;
};

const getHighestRoleFromList = (values: unknown[]): DashboardRole => {
  let highest: DashboardRole = null;

  for (const value of values) {
    const normalized = normalizeRole(value);
    if (!normalized) continue;
    if (!highest || ROLE_RANK[normalized] > ROLE_RANK[highest]) {
      highest = normalized;
    }
  }

  return highest;
};

const getRequiredRoleForPath = (pathname: string): DashboardRole => {
  if (pathname === '/admin/roles' || pathname.startsWith('/admin/')) {
    return 'admin';
  }

  if (
    pathname === '/agenda/agm' ||
    pathname === '/agenda/agm-minutes' ||
    pathname === '/agenda/agm-questions' ||
    pathname === '/agenda/aob' ||
    pathname === '/agenda/apologies' ||
    pathname === '/agenda/conflicts' ||
    pathname === '/agenda/correspondence' ||
    pathname === '/agenda/events' ||
    pathname === '/agenda/membership' ||
    pathname === '/agenda/rugby' ||
    pathname === '/agenda/trading' ||
    pathname === '/agenda/treasury'
  ) {
    return 'management';
  }

  if (pathname === '/agenda/safeguarding') {
    return 'safeguarding';
  }

  if (
    pathname === '/agenda/commercial-transformation' ||
    pathname === '/agenda/gym' ||
    pathname === '/agenda/job-club'
  ) {
    return 'commercial';
  }

  return null;
};

const hasRequiredRole = (actual: DashboardRole, required: DashboardRole) => {
  if (!required) return true;
  if (!actual) return false;
  return ROLE_RANK[actual] >= ROLE_RANK[required];
};

export async function proxy(req: NextRequest) {
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

  if (session && req.nextUrl.pathname === '/auth/login') {
    const redirectUrl = new URL('/', req.url);
    return NextResponse.redirect(redirectUrl);
  }

  if (session) {
    const requiredRole = getRequiredRoleForPath(req.nextUrl.pathname);

    if (requiredRole) {
      const { data: userResult } = await supabase.auth.getUser();
      const user = userResult.user;

      const roleFromAppMeta = normalizeRole((user?.app_metadata as any)?.role);
      const roleFromUserMeta = normalizeRole((user?.user_metadata as any)?.role);
      const appMetaRoles = Array.isArray((user?.app_metadata as any)?.roles)
        ? (user?.app_metadata as any).roles
        : [];
      const userMetaRoles = Array.isArray((user?.user_metadata as any)?.roles)
        ? (user?.user_metadata as any).roles
        : [];
      const roleFromAppArray = getHighestRoleFromList(appMetaRoles);
      const roleFromUserArray = getHighestRoleFromList(userMetaRoles);

      const effectiveRole = roleFromAppMeta || roleFromUserMeta || roleFromAppArray || roleFromUserArray;

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
