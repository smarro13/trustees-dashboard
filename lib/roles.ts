export type DashboardRole = 'admin' | 'management' | 'president' | 'safeguarding' | 'commercial' | null;

const ROLE_RANK: Record<Exclude<DashboardRole, null>, number> = {
  admin: 4,
  management: 3,
  president: 2,
  safeguarding: 2,
  commercial: 1,
};

export function normalizeRole(rawRole: unknown): DashboardRole {
  if (typeof rawRole !== 'string') return null;

  const value = rawRole.trim().toLowerCase();
  if (!value) return null;

  if (value === 'admin') return 'admin';
  if (value === 'management' || value === 'mangement') return 'management';
  if (value === 'president') return 'president';
  if (value === 'safeguarding') return 'safeguarding';
  if (value === 'commercial' || value === 'commerical') return 'commercial';

  return null;
}

export function highestRoleFromList(values: unknown[]): DashboardRole {
  let highest: DashboardRole = null;

  for (const value of values) {
    const normalized = normalizeRole(value);
    if (!normalized) continue;
    if (!highest || ROLE_RANK[normalized] > ROLE_RANK[highest]) {
      highest = normalized;
    }
  }

  return highest;
}

// Record<string, unknown> (not an all-optional named interface) so this structurally
// accepts Supabase's User type — an interface with only optional `role`/`roles` keys
// and no overlap with UserAppMetadata trips TypeScript's "weak type" check.
type MetadataBag = Record<string, unknown> | null | undefined;
export type MetadataUser = { app_metadata?: MetadataBag; user_metadata?: MetadataBag } | null | undefined;

// Canonical role resolution: a singular `role` claim wins over the `roles` list
// (highest-ranked entry), app_metadata wins over user_metadata (app_metadata is
// only writable by the service role, so it's the trustworthy source).
export function resolveRole(user: MetadataUser): DashboardRole {
  const roleFromAppMeta = normalizeRole(user?.app_metadata?.role);
  if (roleFromAppMeta) return roleFromAppMeta;

  const roleFromUserMeta = normalizeRole(user?.user_metadata?.role);
  if (roleFromUserMeta) return roleFromUserMeta;

  const appMetaRoles = Array.isArray(user?.app_metadata?.roles) ? (user!.app_metadata!.roles as unknown[]) : [];
  const roleFromAppArray = highestRoleFromList(appMetaRoles);
  if (roleFromAppArray) return roleFromAppArray;

  const userMetaRoles = Array.isArray(user?.user_metadata?.roles) ? (user!.user_metadata!.roles as unknown[]) : [];
  return highestRoleFromList(userMetaRoles);
}

export function hasRequiredRole(actual: DashboardRole, required: DashboardRole): boolean {
  if (!required) return true;
  if (!actual) return false;

  // Admin and management can access all protected agenda sections.
  if (actual === 'admin' || actual === 'management') return true;

  if (actual === 'president') return required === 'president' || required === 'commercial';
  if (actual === 'safeguarding') return required === 'safeguarding';
  if (actual === 'commercial') return required === 'commercial';

  return false;
}

export function getRequiredRoleForPath(pathname: string): DashboardRole {
  if (pathname === '/admin/roles' || pathname.startsWith('/admin/')) {
    return 'admin';
  }

  if (pathname === '/agenda/safeguarding') {
    return 'safeguarding';
  }

  if (pathname === '/agenda/commercial-transformation') {
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

  return null;
}
