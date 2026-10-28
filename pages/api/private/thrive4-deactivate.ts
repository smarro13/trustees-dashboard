import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { type Thrive4BillingPerson, Thrive4Error, fetchThrive4Billing, makeThrive4Inactive } from '../../../lib/thrive4';
import { billingByName, findClubControl, mandateMemberId, paysByDirectDebit } from '../../../lib/membership';
import { ClubControlError, fetchMandates, hasActiveMandate } from '../../../lib/clubcontrol';

// LoveAdmin migration (temporary) — see LOVEADMIN_MIGRATION.md.
// Makes people inactive on Thrive4 (lib/thrive4.ts makeThrive4Inactive), which
// stops their Thrive4 subscriptions. Used by the Thrive4 billing card's "Make
// inactive" buttons on /operations/membership. Admins only.
//
// Only people who've moved can be made inactive: each one is checked again
// here, and must still be billed by Thrive4 AND have an active direct debit in
// the latest ClubControl fetch AND an active GoCardless mandate on their
// ClubControl record, read live (lib/clubcontrol.ts fetchMandates). Anyone else in the request is refused,
// whatever the page sent. Every attempt is logged in thrive4_deactivations
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
  // Moved = an active direct debit in the latest ClubControl export (being
  // "active" there isn't enough: everyone was brought across as active).
  const { data: latest } = await supabaseAdmin
    .from('membership_imports')
    .select('id')
    .eq('kind', 'members')
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) return res.status(409).json({ ok: false, error: 'There’s no ClubControl data yet. Fetch from ClubControl first.' });
  const { data: members, error: membersError } = await supabaseAdmin
    .from('membership_members')
    .select('first_name, last_name, billing_method, external_id, covered_by_id, mandate_status')
    .eq('import_id', latest.id)
    .range(0, 9999);
  if (membersError) {
    return res.status(500).json({
      ok: false,
      error: /billing_method|covered_by_id|mandate_status/.test(membersError.message)
        ? 'Direct debit status isn’t stored yet: run supabase/policies/membership_billing_method.sql, then fetch from ClubControl.'
        : membersError.message,
    });
  }
  const billingNames = billingByName(members ?? []);
  const billedByGuid = new Map(billing.map((p) => [p.person_guid, p]));

  const candidates = requested.filter((g) => {
    const p = billedByGuid.get(g);
    // Their own direct debit, or the account that pays for them.
    return p && paysByDirectDebit(findClubControl(p.name, billingNames)?.record);
  });

  // And an active GoCardless mandate on their ClubControl record, read live now.
  // The mandate is on their own record, or on the paying account's.
  const memberIdOf = (g: string) => mandateMemberId(findClubControl(billedByGuid.get(g)?.name ?? '', billingNames)?.record) ?? '';
  let mandates;
  try {
    mandates = await fetchMandates(candidates.map(memberIdOf).filter(Boolean));
  } catch (e) {
    return res.status(502).json({ ok: false, error: e instanceof ClubControlError ? e.message : 'Checking ClubControl failed.' });
  }
  const allowed = candidates.filter((g) => hasActiveMandate(mandates.get(memberIdOf(g))));
  const refused = requested.length - allowed.length;
  if (allowed.length === 0) {
    return res.status(409).json({ ok: false, error: 'None of them are billed on Thrive4 with an active direct debit mandate in ClubControl. Fetch from ClubControl, then check Thrive4 again.' });
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
