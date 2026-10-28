import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { type Thrive4BillingPerson, Thrive4Error, fetchThrive4Billing, makeThrive4Inactive } from '../../../lib/thrive4';
import { loadMembershipData } from '../../../lib/membershipSummary';
import { isPaidUp, nameKey } from '../../../lib/membership';

// LoveAdmin migration (temporary) — see LOVEADMIN_MIGRATION.md.
// Makes people inactive on Thrive4 (lib/thrive4.ts makeThrive4Inactive), which
// stops their Thrive4 subscriptions. Used by the Thrive4 billing card's "Make
// inactive" buttons on /operations/membership. Admins only.
//
// Only people who've moved can be made inactive: each one is checked again
// here, and must still be billed by Thrive4 AND be active in the latest
// ClubControl export. Anyone else in the request is refused, whatever the page
// sent. Every attempt is logged in thrive4_deactivations
// (supabase/policies/membership_loveadmin.sql).

export const config = { maxDuration: 60 };

const MAX_PER_REQUEST = 200;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const isAdmin = (user: any) =>
  [user?.app_metadata?.role, user?.user_metadata?.role].some((r) => typeof r === 'string' && r.trim().toLowerCase() === 'admin');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  if (!isAdmin(user)) return res.status(403).json({ ok: false, error: 'Only admins can make people inactive on Thrive4.' });

  const requested: string[] = Array.isArray(req.body?.personGuids)
    ? [...new Set<string>(req.body.personGuids.filter((g: unknown): g is string => typeof g === 'string' && /^[0-9a-f-]{36}$/i.test(g)))]
    : [];
  if (requested.length === 0) return res.status(400).json({ ok: false, error: 'Nobody to make inactive.' });
  if (requested.length > MAX_PER_REQUEST) return res.status(400).json({ ok: false, error: `At most ${MAX_PER_REQUEST} at a time.` });

  // Check again, against Thrive4 and ClubControl as they are now.
  let billing: Thrive4BillingPerson[];
  try {
    billing = await fetchThrive4Billing();
  } catch (e) {
    return res.status(502).json({ ok: false, error: e instanceof Thrive4Error ? e.message : 'Checking Thrive4 failed.' });
  }
  const { members } = await loadMembershipData(supabaseAdmin);
  const activeNames = new Set(members.filter(isPaidUp).map((m) => nameKey(m.first_name, m.last_name)));
  const billedByGuid = new Map(billing.map((p) => [p.person_guid, p]));

  const allowed = requested.filter((g) => {
    const p = billedByGuid.get(g);
    return p && activeNames.has(nameKey(p.name, ''));
  });
  const refused = requested.length - allowed.length;
  if (allowed.length === 0) {
    return res.status(409).json({ ok: false, error: 'None of them are both billed on Thrive4 and active in ClubControl any more. Check Thrive4 again.' });
  }

  let results;
  try {
    results = await makeThrive4Inactive(allowed);
  } catch (e) {
    return res.status(502).json({ ok: false, error: e instanceof Thrive4Error ? e.message : 'Thrive4 couldn’t be reached.' });
  }

  const doneBy = user.email || user.id;
  await supabaseAdmin.from('thrive4_deactivations').insert(
    results.map((r) => ({ person_guid: r.person_guid, name: billedByGuid.get(r.person_guid)?.name ?? '', done_by: doneBy, ok: r.ok, error: r.error ?? null })),
  );

  const done = results.filter((r) => r.ok).map((r) => r.person_guid);
  const failed = results.filter((r) => !r.ok).map((r) => ({ person_guid: r.person_guid, name: billedByGuid.get(r.person_guid)?.name ?? '', error: r.error }));
  return res.status(failed.length && !done.length ? 502 : 200).json({ ok: done.length > 0, done, failed, refused });
}
