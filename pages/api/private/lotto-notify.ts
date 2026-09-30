import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// Emails the three winners of a saved Presidents Lotto draw via Resend.
// Called by /agenda/presidents-lotto straight after a draw is saved, or with
// { test: true, memberId } from the page's admin-only "Test winner email" panel.
//
// Env: RESEND_API_KEY (required to send), LOTTO_EMAIL_FROM (a sender on a
// domain verified in Resend), LOTTO_EMAIL_REPLY_TO (optional).

// Kept local (not imported from lib/roles.ts) because this is a server-side
// API route — see pages/api/private/prematch-meals-orders.ts.
type DashboardRole = 'admin' | 'trustee' | 'director' | 'president' | 'safeguarding' | 'commercial' | null;

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
  return null;
};

const resolveRole = (user: any): DashboardRole => {
  return normalizeRole(user?.app_metadata?.role) || normalizeRole(user?.user_metadata?.role);
};

// Who can run the lotto — mirrors canCurrentUserEditThisAgendaPage in
// lib/presidentPermissions.ts for '/agenda/presidents-lotto'.
const canRunLotto = (role: DashboardRole) =>
  !role || role === 'admin' || role === 'director' || role === 'trustee';

const getBearerToken = (req: NextApiRequest) => {
  const authHeader = req.headers.authorization;
  return typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : '';
};

const PLACES = ['1st', '2nd', '3rd'] as const;

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const buildEmail = (name: string, place: string, drawnAt: string) => {
  const date = new Date(drawnAt).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London',
  });
  const subject = `You've won ${place} place in the Aldwinians Presidents Lotto!`;
  const text = [
    `Hi ${name},`,
    '',
    `Congratulations — you came ${place} in the Aldwinians RUFC Presidents Lotto draw on ${date}.`,
    '',
    'To claim your prize, please email finance@aldwinians.co.uk with your preferred bank details and your winnings will be sent to you as soon as possible.',
    '',
    'Thank you for supporting the club.',
    'Aldwinians RUFC',
  ].join('\n');
  const html = `
    <p>Hi ${escapeHtml(name)},</p>
    <p>Congratulations — you came <strong>${place}</strong> in the Aldwinians RUFC Presidents Lotto draw on ${date}.</p>
    <p>To claim your prize, please email <a href="mailto:finance@aldwinians.co.uk">finance@aldwinians.co.uk</a> with your preferred bank details and your winnings will be sent to you as soon as possible.</p>
    <p>Thank you for supporting the club.<br>Aldwinians RUFC</p>
  `;
  return { subject, text, html };
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  if (!canRunLotto(resolveRole(user))) {
    return res.status(403).json({ ok: false, error: 'Your role cannot run the lotto.' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LOTTO_EMAIL_FROM;
  const send = (to: string, email: ReturnType<typeof buildEmail>) =>
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        ...email,
        ...(process.env.LOTTO_EMAIL_REPLY_TO ? { reply_to: process.env.LOTTO_EMAIL_REPLY_TO } : {}),
      }),
    });

  // Test mode (admin only): send one member the 1st-place email, marked
  // [TEST], without creating or touching any draw.
  if (req.body?.test === true) {
    if (resolveRole(user) !== 'admin') {
      return res.status(403).json({ ok: false, error: 'Only admins can send test emails.' });
    }
    const memberId = typeof req.body?.memberId === 'string' ? req.body.memberId : '';
    if (!memberId) return res.status(400).json({ ok: false, error: 'memberId is required.' });
    if (!apiKey || !from) {
      return res.status(200).json({ ok: false, error: 'Winner emails are not set up yet (RESEND_API_KEY / LOTTO_EMAIL_FROM).' });
    }

    const [memberRes, contactRes] = await Promise.all([
      supabaseAdmin.from('presidents_lotto_members').select('name').eq('id', memberId).single(),
      supabaseAdmin.from('presidents_lotto_member_contacts').select('email').eq('member_id', memberId).maybeSingle(),
    ]);
    if (memberRes.error || !memberRes.data) return res.status(404).json({ ok: false, error: 'Member not found.' });
    const to = contactRes.data?.email?.trim();
    if (!to) return res.status(400).json({ ok: false, error: `${memberRes.data.name} has no email address.` });

    const email = buildEmail(memberRes.data.name, PLACES[0], new Date().toISOString());
    const response = await send(to, { ...email, subject: `[TEST] ${email.subject}` });
    if (!response.ok) {
      return res.status(502).json({ ok: false, error: `Resend rejected the email: ${await response.text()}` });
    }
    return res.status(200).json({ ok: true, sentTo: memberRes.data.name });
  }

  const drawId = typeof req.body?.drawId === 'string' ? req.body.drawId : '';
  const memberIds: unknown = req.body?.memberIds;
  if (!drawId || !Array.isArray(memberIds) || memberIds.length !== 3 || !memberIds.every((id) => typeof id === 'string')) {
    return res.status(400).json({ ok: false, error: 'drawId and three memberIds are required.' });
  }

  if (!apiKey || !from) {
    return res.status(200).json({ ok: true, configured: false, sent: [], skipped: [] });
  }

  const { data: draw, error: drawError } = await supabaseAdmin
    .from('presidents_lotto_draws')
    .select('id, first_place, second_place, third_place, drawn_at, winners_notified_at')
    .eq('id', drawId)
    .single();
  if (drawError || !draw) return res.status(404).json({ ok: false, error: 'Draw not found.' });
  if (draw.winners_notified_at) {
    return res.status(409).json({ ok: false, error: 'Winners of this draw have already been emailed.' });
  }

  const [membersRes, contactsRes] = await Promise.all([
    supabaseAdmin.from('presidents_lotto_members').select('id, name').in('id', memberIds as string[]),
    // Admin-only table (see supabase/policies/presidents_lotto_notifications.sql);
    // readable here because this client uses the service role key.
    supabaseAdmin.from('presidents_lotto_member_contacts').select('member_id, email').in('member_id', memberIds as string[]),
  ]);
  if (membersRes.error) return res.status(500).json({ ok: false, error: membersRes.error.message });
  if (contactsRes.error) return res.status(500).json({ ok: false, error: contactsRes.error.message });

  const drawNames = [draw.first_place, draw.second_place, draw.third_place];
  const winners = (memberIds as string[]).map((id) => {
    const member = membersRes.data?.find((m) => m.id === id);
    if (!member) return undefined;
    const email = contactsRes.data?.find((c) => c.member_id === id)?.email ?? null;
    return { ...member, email };
  });

  // Only email the members actually recorded as this draw's winners.
  if (winners.some((m, i) => !m || m.name !== drawNames[i])) {
    return res.status(400).json({ ok: false, error: 'Members do not match the saved draw.' });
  }

  const sent: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];

  for (const [i, winner] of winners.entries()) {
    const email = winner!.email?.trim();
    if (!email) { skipped.push(winner!.name); continue; }

    const response = await send(email, buildEmail(winner!.name, PLACES[i], draw.drawn_at));
    if (response.ok) sent.push(winner!.name);
    else failed.push(winner!.name);
  }

  if (sent.length > 0) {
    await supabaseAdmin
      .from('presidents_lotto_draws')
      .update({ winners_notified_at: new Date().toISOString() })
      .eq('id', drawId);
  }

  return res.status(200).json({ ok: true, configured: true, sent, skipped, failed });
}
