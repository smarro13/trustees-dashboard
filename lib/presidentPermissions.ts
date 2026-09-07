import { supabase } from './supabaseClient';
import { resolveRoleFromUser } from './roles';

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
  const role = resolveRoleFromUser(data.user);

  // Trustees have full governance authority — same edit access as admin/director.
  if (!role || role === 'admin' || role === 'director' || role === 'trustee') return true;
  if (role === 'president') return PRESIDENT_EDITABLE_PATHS.has(pathname);
  if (role === 'commercial') return COMMERCIAL_EDITABLE_PATHS.has(pathname);
  if (role === 'safeguarding') return SAFEGUARDING_EDITABLE_PATHS.has(pathname);

  return true;
};
