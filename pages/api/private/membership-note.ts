import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// Saves a comment on a person on /operations/membership, and the admin-only
// "hide from report" flag (membership_notes in supabase/policies/membership.sql).
//
// Admins, trustees and directors can comment; only admins can hide or unhide.
// Hiding someone needs a comment, and a hidden person's comment can't be
// cleared. A comment that's cleared on someone who isn't hidden is deleted.

// Kept local (not imported from lib/roles.ts) because this is a server-side
// API route — see pages/api/private/prematch-meals-orders.ts.
type DashboardRole = 'admin' | 'trustee' | 'director' | 'president' | 'safeguarding' | 'commercial' | 'dor' | null;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const normalizeRole = (rawRole: unknown): DashboardRole => {
  if (typeof rawRole !== 'string') return null;
  const value = rawRole.trim().toLowerCase();
  if (value === 'admin') return 'admin';
  if (value === 'trustee') return 'trustee';
  if (value === 'director' || value === 'directors' || value === 'management' || value === 'mangement') return 'director';
  if (value === 'president') return 'president';
  if (value === 'safeguarding') return 'safeguarding';
  if (value === 'commercial' || value === 'commerical') return 'commercial';
  if (value === 'dor' || value === 'director of rugby' || value === 'director-of-rugby' || value === 'director_of_rugby') return 'dor';
  return null;
};

const resolveRole = (user: any): DashboardRole =>
  normalizeRole(user?.app_metadata?.role) || normalizeRole(user?.user_metadata?.role);

// Mirrors the read policies in membership.sql.
const COMMENT_ROLES: DashboardRole[] = ['admin', 'trustee', 'director', 'dor'];

const MAX_NOTE_LENGTH = 2000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  const role = resolveRole(user);
  if (!COMMENT_ROLES.includes(role)) {
    return res.status(403).json({ ok: false, error: 'Your role cannot comment on membership records.' });
  }

  const personKey = typeof req.body?.personKey === 'string' ? req.body.personKey.trim().slice(0, 200) : '';
  const displayName = typeof req.body?.displayName === 'string' ? req.body.displayName.trim().slice(0, 200) : '';
  const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
  const wantsHidden = typeof req.body?.hidden === 'boolean' ? req.body.hidden : undefined;
  if (!personKey || !displayName) return res.status(400).json({ ok: false, error: 'personKey and displayName are required.' });
  if (note.length > MAX_NOTE_LENGTH) {
    return res.status(400).json({ ok: false, error: `Keep comments under ${MAX_NOTE_LENGTH} characters.` });
  }

  const { data: existing, error: loadError } = await supabaseAdmin
    .from('membership_notes')
    .select('hidden')
    .eq('person_key', personKey)
    .maybeSingle();
  if (loadError) return res.status(500).json({ ok: false, error: loadError.message });

  if (wantsHidden !== undefined && wantsHidden !== (existing?.hidden ?? false) && role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Only admins can hide records from the report.' });
  }
  const hidden = role === 'admin' && wantsHidden !== undefined ? wantsHidden : existing?.hidden ?? false;
  // Anyone hidden from the report needs a comment saying why.
  if (hidden && !note) {
    return res.status(400).json({ ok: false, error: 'Add a comment saying why they’re hidden from the report.' });
  }

  if (!note && !hidden) {
    const { error } = await supabaseAdmin.from('membership_notes').delete().eq('person_key', personKey);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(200).json({ ok: true, note: null });
  }

  const { data: saved, error: saveError } = await supabaseAdmin
    .from('membership_notes')
    .upsert({
      person_key: personKey,
      display_name: displayName,
      note,
      hidden,
      updated_at: new Date().toISOString(),
      updated_by: user.email || user.id,
    })
    .select('*')
    .single();
  if (saveError || !saved) return res.status(500).json({ ok: false, error: saveError?.message ?? 'Save failed.' });

  return res.status(200).json({ ok: true, note: saved });
}
