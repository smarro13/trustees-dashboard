import { supabase } from './supabaseClient';

type DashboardRole = 'admin' | 'management' | 'president' | 'safeguarding' | 'commercial' | null;

const normalizeRole = (rawRole: unknown): DashboardRole => {
  if (typeof rawRole !== 'string') return null;

  const value = rawRole.trim().toLowerCase();
  if (!value) return null;

  if (value === 'admin') return 'admin';
  if (value === 'management' || value === 'mangement') return 'management';
  if (value === 'president') return 'president';
  if (value === 'safeguarding') return 'safeguarding';
  if (value === 'commercial' || value === 'commerical') return 'commercial';

  return null;
};

const resolveRole = (user: any): DashboardRole => {
  const appRole = normalizeRole(user?.app_metadata?.role);
  if (appRole) return appRole;

  const userRole = normalizeRole(user?.user_metadata?.role);
  if (userRole) return userRole;

  const appRoles = Array.isArray(user?.app_metadata?.roles) ? user.app_metadata.roles : [];
  const userRoles = Array.isArray(user?.user_metadata?.roles) ? user.user_metadata.roles : [];

  return normalizeRole(appRoles[0]) || normalizeRole(userRoles[0]);
};

const PRESIDENT_EDITABLE_PATHS = new Set(['/agenda/actions', '/agenda/matters-arising', '/agenda/aob']);
const COMMERCIAL_EDITABLE_PATHS = new Set([
  '/agenda/commercial-transformation',
  '/agenda/actions',
  '/agenda/matters-arising',
  '/agenda/aob',
]);
const SAFEGUARDING_EDITABLE_PATHS = new Set(['/agenda/safeguarding']);

export const PRESIDENT_EDIT_BLOCK_MESSAGE =
  'You have read-only access on this page for your current role.';

export const canCurrentUserEditThisAgendaPage = async (): Promise<boolean> => {
  if (typeof window === 'undefined') return true;

  const pathname = window.location.pathname;
  if (!pathname.startsWith('/agenda/')) return true;

  const { data } = await supabase.auth.getUser();
  const role = resolveRole(data.user);

  if (!role || role === 'admin' || role === 'management') return true;
  if (role === 'president') return PRESIDENT_EDITABLE_PATHS.has(pathname);
  if (role === 'commercial') return COMMERCIAL_EDITABLE_PATHS.has(pathname);
  if (role === 'safeguarding') return SAFEGUARDING_EDITABLE_PATHS.has(pathname);

  return true;
};
