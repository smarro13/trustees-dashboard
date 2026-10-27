// Server-only: emails every admin when the weekly link check finds broken
// links on the club website (pages/api/cron/link-check.ts). Sent through
// Resend with the same key as the Presidents Lotto emails.
//
// Env: RESEND_API_KEY, and LINK_CHECK_EMAIL_FROM (falls back to LOTTO_EMAIL_FROM).

import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { LinkCheckResult } from './linkChecker';
import { resolveRoleFromUser } from './roles';

const PAGE_URL = 'https://dashboard.aldwinians.co.uk/operations/link-checker';
const MAX_LISTED = 25;

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

const adminEmails = async (supabaseAdmin: SupabaseClient) => {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`Couldn't list admins: ${error.message}`);
  return (data.users as User[]).filter((u) => u.email && resolveRoleFromUser(u) === 'admin').map((u) => u.email!);
};

/** Emails the admins about the broken links in `result`. Returns who it was sent to, or why it wasn't. */
export async function emailAdminsAboutBrokenLinks(supabaseAdmin: SupabaseClient, result: LinkCheckResult) {
  const broken = result.problems.filter((p) => p.kind === 'broken');
  if (!broken.length) return { sent: [] as string[], skipped: 'no broken links' };

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LINK_CHECK_EMAIL_FROM || process.env.LOTTO_EMAIL_FROM;
  if (!apiKey || !from) return { sent: [] as string[], skipped: 'email not set up (RESEND_API_KEY / LOTTO_EMAIL_FROM)' };

  const to = await adminEmails(supabaseAdmin);
  if (!to.length) return { sent: [] as string[], skipped: 'no admins with an email address' };

  const count = broken.length;
  const subject = `${count} broken link${count === 1 ? '' : 's'} on ${shortUrl(result.site_url)}`;
  const listed = broken.slice(0, MAX_LISTED);
  const more = count - listed.length;
  const describe = (status: number | null, error: string | null) => (status !== null ? `Error ${status}` : error || 'No response');

  const text = [
    `The weekly link check found ${count} broken link${count === 1 ? '' : 's'} on ${shortUrl(result.site_url)}.`,
    '',
    ...listed.flatMap((p) => [
      `${p.url} (${describe(p.status, p.error)})`,
      `  On: ${p.found_on.join(', ')}`,
    ]),
    ...(more > 0 ? ['', `…and ${more} more.`] : []),
    '',
    `Full report: ${PAGE_URL}`,
  ].join('\n');

  const html = `
    <p>The weekly link check found <strong>${count} broken link${count === 1 ? '' : 's'}</strong> on ${escapeHtml(shortUrl(result.site_url))}.</p>
    <table cellpadding="6" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">
      ${listed
        .map(
          (p) => `<tr style="border-top:1px solid #eee"><td>
            <a href="${escapeHtml(p.url)}">${escapeHtml(shortUrl(p.url))}</a>
            <span style="color:#b91c1c"> · ${escapeHtml(describe(p.status, p.error))}</span><br>
            <span style="color:#555;font-size:12px">On: ${p.found_on.map((page) => `<a href="${escapeHtml(page)}">${escapeHtml(new URL(page).pathname)}</a>`).join(', ')}</span>
          </td></tr>`,
        )
        .join('')}
    </table>
    ${more > 0 ? `<p>…and ${more} more.</p>` : ''}
    <p><a href="${PAGE_URL}">Open the full report</a> (Club Operations → Website Link Checker).</p>
  `;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, text, html }),
  });
  if (!response.ok) throw new Error(`Resend error ${response.status}: ${await response.text().catch(() => '')}`);
  return { sent: to, skipped: null };
}
