import { supabase } from './supabaseClient';

export type DashboardRole =
  | 'admin'
  | 'trustee'
  | 'director'
  | 'president'
  | 'safeguarding'
  | 'commercial'
  | null;

export const ROLE_RANK: Record<Exclude<DashboardRole, null>, number> = {
  admin: 5,
  trustee: 4,
  director: 3,
  president: 2,
  safeguarding: 2,
  commercial: 1,
};

export const normalizeRole = (rawRole: unknown): DashboardRole => {
  if (typeof rawRole !== 'string') return null;

  const value = rawRole.trim().toLowerCase();
  if (!value) return null;

  if (value === 'admin') return 'admin';
  if (value === 'trustee') return 'trustee';
  // "management" is the legacy name for this role — keep accepting it (and its
  // old typo) so users already assigned it before the "director" rename still work.
  if (value === 'director' || value === 'directors' || value === 'management' || value === 'mangement') return 'director';
  if (value === 'president') return 'president';
  if (value === 'safeguarding') return 'safeguarding';
  if (value === 'commercial' || value === 'commerical') return 'commercial';

  return null;
};

export const getHighestRoleFromList = (values: unknown[]): DashboardRole => {
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

export const resolveRoleFromUser = (user: any): DashboardRole => {
  const appRole = normalizeRole(user?.app_metadata?.role);
  if (appRole) return appRole;

  const userRole = normalizeRole(user?.user_metadata?.role);
  if (userRole) return userRole;

  const appRoles = Array.isArray(user?.app_metadata?.roles) ? user.app_metadata.roles : [];
  const userRoles = Array.isArray(user?.user_metadata?.roles) ? user.user_metadata.roles : [];

  return getHighestRoleFromList(appRoles) || getHighestRoleFromList(userRoles);
};

export const getCurrentUserRole = async (): Promise<DashboardRole> => {
  const { data } = await supabase.auth.getUser();
  return resolveRoleFromUser(data.user);
};

export const roleLabel = (role: DashboardRole) => {
  if (!role) return 'No role';
  return role.charAt(0).toUpperCase() + role.slice(1);
};

export const roleBadgeClass = (role: DashboardRole) => {
  if (role === 'admin') return 'bg-purple-100 text-purple-800';
  if (role === 'trustee') return 'bg-indigo-100 text-indigo-800';
  if (role === 'director') return 'bg-blue-100 text-blue-800';
  if (role === 'president') return 'bg-rose-100 text-rose-800';
  if (role === 'safeguarding') return 'bg-emerald-100 text-emerald-800';
  if (role === 'commercial') return 'bg-amber-100 text-amber-800';
  return 'bg-zinc-100 text-zinc-700';
};

// ── View access (what a role can SEE in the agenda menu, the full meeting
// view, and when navigating directly to an agenda page) ──────────────────
const SAFEGUARDING_HREF = '/agenda/safeguarding';
const COMMERCIAL_VIEW_HREFS = new Set([
  '/agenda/commercial-transformation',
  '/agenda/prematch-meals',
  '/agenda/actions',
  '/agenda/matters-arising',
  '/agenda/aob',
]);

export const canRoleViewAgendaHref = (role: DashboardRole, href: string): boolean => {
  if (!role || role === 'admin' || role === 'trustee') return true;
  if (role === 'director') return href !== SAFEGUARDING_HREF;
  if (role === 'president') return href !== SAFEGUARDING_HREF;
  if (role === 'safeguarding') return href === SAFEGUARDING_HREF;
  if (role === 'commercial') return COMMERCIAL_VIEW_HREFS.has(href);
  return false;
};
