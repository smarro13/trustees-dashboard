// Server-only: emails the club when a VEO camera is booked, collected (out),
// returned (in) or cancelled. Sent through Resend with the same key as the
// Presidents Lotto emails. Never import this from a page component.
//
// Env: RESEND_API_KEY, and VEO_EMAIL_FROM (falls back to LOTTO_EMAIL_FROM).

import { VEO_PURPOSES, formatVeoTime } from './veoBookings';

export const VEO_EMAIL_TO = ['info@aldwinians.co.uk'];
export const VEO_EMAIL_CC = [
  'finance@aldwiniansltd.co.uk',
  'finance@aldwinians.co.uk',
  'mikesingletonarufc@gmail.com',
];

export type VeoEmailEvent = 'booked' | 'collected' | 'returned' | 'cancelled';

export type VeoEmailBooking = {
  camera: string;
  booked_by: string;
  contact_phone: string;
  contact_email: string | null;
  team_name: string;
  purpose: string;
  fixture: string | null;
  time_out: string;
  time_in: string;
  accessories: string[];
  notes: string | null;
  collected_at?: string | null;
  returned_at?: string | null;
  return_notes?: string | null;
};

const HEADLINES: Record<VeoEmailEvent, string> = {
  booked: 'booked',
  collected: 'collected (out)',
  returned: 'returned (in)',
  cancelled: 'booking cancelled',
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const buildEmail = (event: VeoEmailEvent, b: VeoEmailBooking, by?: string, forClub = true) => {
  const purpose = VEO_PURPOSES.find((p) => p.value === b.purpose)?.label ?? b.purpose;
  const subject = `${b.camera} ${HEADLINES[event]} — ${b.team_name}, ${formatVeoTime(b.time_out)}`;

  const rows: [string, string][] = [
    ['Camera', b.camera],
    ['Team', b.team_name],
    ['Booked by', b.booked_by],
    ['Mobile', b.contact_phone],
    ...(b.contact_email ? [['Email', b.contact_email] as [string, string]] : []),
    ['For', b.fixture ? `${purpose} — ${b.fixture}` : purpose],
    ['Time out', formatVeoTime(b.time_out)],
    ['Due back in', formatVeoTime(b.time_in)],
    ...(b.accessories.length ? [['Taking', b.accessories.join(', ')] as [string, string]] : []),
    ...(b.notes ? [['Notes', b.notes] as [string, string]] : []),
    ...(event === 'collected' && b.collected_at ? [['Collected at', formatVeoTime(b.collected_at)] as [string, string]] : []),
    ...(event === 'returned' && b.returned_at ? [['Returned at', formatVeoTime(b.returned_at)] as [string, string]] : []),
    ...(event === 'returned' && b.return_notes ? [['Return notes', b.return_notes] as [string, string]] : []),
    ...(by ? [['Recorded by', by] as [string, string]] : []),
  ];

  const intro = `${b.camera} ${HEADLINES[event]} for ${b.team_name}.`;
  const text = [intro, '', ...rows.map(([k, v]) => `${k}: ${v}`)].join('\n');
  const html = `
    <p>${escapeHtml(intro)}</p>
    <table cellpadding="4" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">
      ${rows.map(([k, v]) => `<tr><td style="color:#555;padding-right:16px">${escapeHtml(k)}</td><td><strong>${escapeHtml(v)}</strong></td></tr>`).join('')}
    </table>
    ${forClub ? '<p style="color:#777;font-size:12px">Manage bookings on the trustees dashboard: Club Operations → VEO Bookings.</p>' : ''}
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

// Emails the club about a booking event. Never throws: an email problem must
// not stop a booking being saved or updated. Returns whether it was sent.
export async function sendVeoClubEmail(event: VeoEmailEvent, booking: VeoEmailBooking, by?: string) {
  try {
    const email = buildEmail(event, booking, by);
    return await send({
      to: VEO_EMAIL_TO,
      cc: VEO_EMAIL_CC,
      reply_to: booking.contact_email || undefined,
      ...email,
    });
  } catch {
    return false;
  }
}

// Confirmation to the coach, if they gave an email address.
export async function sendVeoBookerConfirmation(booking: VeoEmailBooking) {
  if (!booking.contact_email) return false;
  try {
    const { text, html } = buildEmail('booked', booking, undefined, false);
    return await send({
      to: [booking.contact_email],
      reply_to: VEO_EMAIL_TO[0],
      subject: `Your ${booking.camera} booking — ${formatVeoTime(booking.time_out)}`,
      text: `${text}\n\nPlease return the camera charged and in its case by the time above. To change or cancel, contact ${VEO_EMAIL_TO[0]}.`,
      html: `${html}<p>Please return the camera charged and in its case by the time above. To change or cancel, contact <a href="mailto:${VEO_EMAIL_TO[0]}">${VEO_EMAIL_TO[0]}</a>.</p>`,
    });
  } catch {
    return false;
  }
}
