// Server-only: emails the club when a VEO camera is signed out, signed back
// in, or an entry is cancelled. Sent through Resend with the same key as the
// Presidents Lotto emails. Never import this from a page component.
//
// Env: RESEND_API_KEY, and VEO_EMAIL_FROM (falls back to LOTTO_EMAIL_FROM).

import { VEO_PURPOSES, formatVeoTime, veoDurationSince } from './veoBookings';

export const VEO_EMAIL_TO = ['info@aldwinians.co.uk'];
export const VEO_EMAIL_CC = [
  'finance@aldwiniansltd.co.uk',
  'finance@aldwinians.co.uk',
  'mikesingletonarufc@gmail.com',
];

export type VeoEmailEvent = 'out' | 'returned' | 'cancelled';

export type VeoEmailBooking = {
  camera: string;
  booked_by: string;
  contact_email: string | null;
  team_name: string;
  purpose: string;
  fixture: string | null;
  time_out: string;
  time_in: string | null;
  accessories: string[];
  notes: string | null;
  return_notes?: string | null;
  live_url?: string | null;
  recording_url?: string | null;
};

const HEADLINES: Record<VeoEmailEvent, string> = {
  out: 'signed out',
  returned: 'returned',
  cancelled: 'sign-out cancelled',
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

type Row = [string, string];

const buildEmail = (event: VeoEmailEvent, b: VeoEmailBooking, by?: string, forClub = true) => {
  const purpose = VEO_PURPOSES.find((p) => p.value === b.purpose)?.label ?? b.purpose;
  const when = event === 'returned' && b.time_in ? b.time_in : b.time_out;
  const subject = `${b.camera} ${HEADLINES[event]} — ${b.team_name}, ${formatVeoTime(when)}`;

  const rows: Row[] = [
    ['Camera', b.camera],
    ['Team', b.team_name],
    ['Signed out by', b.booked_by],
    ...(b.contact_email ? [['Email', b.contact_email] as Row] : []),
    ['For', b.fixture ? `${purpose} — ${b.fixture}` : purpose],
    ['Time out', formatVeoTime(b.time_out)],
    ...(b.time_in ? [['Time in', formatVeoTime(b.time_in)] as Row, ['Out for', veoDurationSince(b.time_out, new Date(b.time_in).getTime())] as Row] : []),
    ...(b.accessories.length ? [['Taken', b.accessories.join(', ')] as Row] : []),
    ...(b.notes ? [['Notes', b.notes] as Row] : []),
    ...(b.return_notes ? [['Return notes', b.return_notes] as Row] : []),
    ...(b.live_url ? [['Live stream', b.live_url] as Row] : []),
    ...(b.recording_url ? [['Recording', b.recording_url] as Row] : []),
    ...(by ? [['Recorded on dashboard by', by] as Row] : []),
  ];

  const intro = `${b.camera} ${HEADLINES[event]} — ${b.team_name}.`;
  const text = [intro, '', ...rows.map(([k, v]) => `${k}: ${v}`)].join('\n');
  const html = `
    <p>${escapeHtml(intro)}</p>
    <table cellpadding="4" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">
      ${rows.map(([k, v]) => `<tr><td style="color:#555;padding-right:16px">${escapeHtml(k)}</td><td><strong>${escapeHtml(v)}</strong></td></tr>`).join('')}
    </table>
    ${forClub ? '<p style="color:#777;font-size:12px">Full log on the trustees dashboard: Club Operations → VEO Bookings.</p>' : ''}
  `;
  return { subject, text, html };
};

const send = async (payload: Record<string, unknown>) => {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.VEO_EMAIL_FROM || process.env.LOTTO_EMAIL_FROM;
  if (!apiKey || !from) return false;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, ...payload }),
  });
  return response.ok;
};

// Emails the club. Never throws: an email problem must not stop a sign-out
// or return being saved. Returns whether it was sent.
export async function sendVeoClubEmail(event: VeoEmailEvent, booking: VeoEmailBooking, by?: string) {
  try {
    return await send({
      to: VEO_EMAIL_TO,
      cc: VEO_EMAIL_CC,
      reply_to: booking.contact_email || undefined,
      ...buildEmail(event, booking, by),
    });
  } catch {
    return false;
  }
}

// Copy to the coach at sign-out, if they gave an email address.
export async function sendVeoBookerConfirmation(booking: VeoEmailBooking) {
  if (!booking.contact_email) return false;
  try {
    const { text, html } = buildEmail('out', booking, undefined, false);
    const reminder = 'When you bring it back, sign it back in on the same page: dashboard.aldwinians.co.uk/public/veo-booking?mode=return. Please return it charged and in its case.';
    return await send({
      to: [booking.contact_email],
      reply_to: VEO_EMAIL_TO[0],
      subject: `You've signed out ${booking.camera}`,
      text: `${text}\n\n${reminder}`,
      html: `${html}<p>When you bring it back, sign it back in on the same page: <a href="https://dashboard.aldwinians.co.uk/public/veo-booking?mode=return">dashboard.aldwinians.co.uk/public/veo-booking</a>. Please return it charged and in its case.</p>`,
    });
  } catch {
    return false;
  }
}
