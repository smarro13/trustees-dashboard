import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

type DashboardRole = 'admin' | 'trustee' | 'director' | 'president' | 'safeguarding' | 'commercial' | 'dor' | null;

const ROLE_RANK: Record<Exclude<DashboardRole, null>, number> = {
  admin: 5,
  trustee: 4,
  director: 3,
  president: 2,
  safeguarding: 2,
  commercial: 1,
  dor: 1,
};

const normalizeRole = (rawRole: unknown): DashboardRole => {
  if (typeof rawRole !== 'string') return null;

  const value = rawRole.trim().toLowerCase();
  if (!value) return null;

  if (value === 'admin') return 'admin';
  if (value === 'trustee') return 'trustee';
  // "management" is the legacy name for this role — keep accepting it so users
  // already assigned it before the "director" rename still resolve correctly.
  if (value === 'director' || value === 'directors' || value === 'management' || value === 'mangement') return 'director';
  if (value === 'president') return 'president';
  if (value === 'safeguarding') return 'safeguarding';
  if (value === 'commercial' || value === 'commerical') return 'commercial';
  if (value === 'dor' || value === 'director of rugby' || value === 'director-of-rugby' || value === 'director_of_rugby') return 'dor';

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

  if (pathname === '/agenda/safeguarding') {
    return 'safeguarding';
  }

  if (
    pathname === '/agenda/commercial-transformation' ||
    pathname.startsWith('/agenda/prematch-meals') ||
    pathname.startsWith('/agenda/anniversary-ties') ||
    pathname.startsWith('/agenda/halloween')
  ) {
    return 'commercial';
  }

  if (
    pathname === '/agenda/actions' ||
    pathname === '/agenda/matters-arising' ||
    pathname === '/agenda/aob'
  ) {
    return 'commercial';
  }

  if (pathname.startsWith('/agenda/')) {
    return 'president';
  }

  // Members' personal data — admins, trustees and directors only. Matches the
  // RLS policies in supabase/policies/membership.sql.
  if (pathname === '/operations/membership' || pathname === '/operations/membership/report') {
    return 'director';
  }

  // Job applicants' personal data — same roles as membership. Matches
  // supabase/policies/vacancies.sql.
  if (pathname === '/operations/vacancies') {
    return 'director';
  }

  return null;
};

// Director of Rugby: the dashboard home (cut down to links to these two), the
// Rugby agenda page and the membership page. Nothing else, including the
// pages with no role requirement (meetings, operations, admin).
const DOR_PATHS = new Set(['/', '/agenda/rugby', '/operations/membership', '/operations/membership/report']);

const hasRequiredRole = (actual: DashboardRole, required: DashboardRole) => {
  if (!required) return true;
  if (!actual) return false;

  // Admin can access everything, including admin-only pages.
  if (actual === 'admin') {
    return true;
  }

  // Trustees can view the whole agenda, including safeguarding, but not admin pages.
  if (actual === 'trustee') {
    return required !== 'admin';
  }

  // Directors can access the whole agenda except safeguarding and admin pages.
  if (actual === 'director') {
    return required !== 'admin' && required !== 'safeguarding';
  }

  if (actual === 'president') {
    return required === 'president' || required === 'commercial';
  }

  if (actual === 'safeguarding') {
    return required === 'safeguarding';
  }

  if (actual === 'commercial') {
    return required === 'commercial';
  }

  return false;
};

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

  if (session && !isPublicRoute && !req.nextUrl.pathname.startsWith('/auth/')) {
    const requiredRole = getRequiredRoleForPath(req.nextUrl.pathname);

    // The Director of Rugby is limited to DOR_PATHS, so their role has to be
    // checked on every page, not only on pages that require a role. The
    // session's own claim decides whether that check is needed (a forged
    // claim can only restrict a user further); the decision itself uses the
    // verified user below.
    const sessionUser = session.user as any;
    const claimedRole =
      normalizeRole(sessionUser?.app_metadata?.role) ||
      normalizeRole(sessionUser?.user_metadata?.role) ||
      getHighestRoleFromList(Array.isArray(sessionUser?.app_metadata?.roles) ? sessionUser.app_metadata.roles : []) ||
      getHighestRoleFromList(Array.isArray(sessionUser?.user_metadata?.roles) ? sessionUser.user_metadata.roles : []);

    if (requiredRole || claimedRole === 'dor') {
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

      if (effectiveRole === 'dor') {
        if (!DOR_PATHS.has(req.nextUrl.pathname)) {
          const redirectUrl = new URL('/', req.url);
          redirectUrl.searchParams.set('access', 'denied');
          return NextResponse.redirect(redirectUrl);
        }
        return response;
      }

      if (requiredRole && !hasRequiredRole(effectiveRole, requiredRole)) {
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
