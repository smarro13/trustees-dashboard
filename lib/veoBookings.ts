// Shared settings for the VEO camera sign-out log — used by the public page,
// its API routes and the dashboard's /operations/veo-bookings page.
// Schema: supabase/policies/veo_bookings.sql.

export const VEO_CAMERAS = ['VEO 1', 'VEO 2'] as const;
export type VeoCamera = (typeof VEO_CAMERAS)[number];

export const VEO_PURPOSES = [
  { value: 'match', label: 'Match' },
  { value: 'training', label: 'Training' },
  { value: 'other', label: 'Other' },
] as const;
export type VeoPurpose = (typeof VEO_PURPOSES)[number]['value'];

export const VEO_ACCESSORIES = ['Tripod', 'Charger / power bank'] as const;

// Club teams, matching the Teams pages on aldwinians.co.uk.
export const VEO_TEAMS = [
  '1st XV', '2nd XV', '3rd XV', 'Vets', 'Ladies', 'Winnies Warriors',
  'Senior Colts (U18)', 'Junior Colts (U17)',
  'U16', 'U16 Girls', 'U15', 'U14', 'U14 Girls', 'U13', 'U12', 'U12 Girls',
  'U11', 'U10', 'U9', 'U8', 'U7', 'Mini Winnies',
] as const;

export type VeoBookingStatus = 'out' | 'returned' | 'cancelled';

// What the public page may see about cameras currently out (no contact details).
export type PublicVeoCheckout = {
  id: string;
  camera: VeoCamera;
  booked_by: string; // first name only
  team_name: string;
  fixture: string | null;
  time_out: string;
  live_url: string | null;
};

// A recently returned session, for the public "Recent recordings" list.
export type PublicVeoRecording = {
  id: string;
  camera: VeoCamera;
  team_name: string;
  purpose: string;
  fixture: string | null;
  time_out: string;
  recording_url: string | null;
};

// The club's page in the Veo app: every recording and live stream, for
// anyone who is a member of the club in Veo.
export const VEO_CLUB_URL = 'https://app.veo.co/clubs/aldwinians-rufc/recordings/';

// How far back the public page lists recordings (and allows adding a link).
export const VEO_RECENT_DAYS = 30;

// Only accept links to Veo's own sites, so the public page can't be used to
// post arbitrary links. Returns the cleaned URL, or null if it isn't a Veo link.
export const cleanVeoUrl = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase();
    const isVeo = ['veo.co', 'veo.com'].some((d) => host === d || host.endsWith(`.${d}`));
    return url.protocol === 'https:' && isVeo ? url.toString().slice(0, 500) : null;
  } catch {
    return null;
  }
};

export const formatVeoTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/London',
  });

// How long a camera has been out, e.g. "3 hours" or "2 days".
export const veoDurationSince = (iso: string, until = Date.now()) => {
  const hours = Math.max(0, (until - new Date(iso).getTime()) / 3_600_000);
  if (hours < 1) return 'under an hour';
  if (hours < 48) return `${Math.round(hours)} hour${Math.round(hours) === 1 ? '' : 's'}`;
  return `${Math.floor(hours / 24)} days`;
};

// Current time as a value for <input type="datetime-local"> (browser's local time).
export const nowForDateTimeInput = () => {
  const d = new Date();
  d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
