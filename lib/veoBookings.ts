// Shared settings for the VEO camera sign-out log — used by the public page,
// its API routes and the dashboard's /operations/veo-bookings page.
// Schema: supabase/policies/veo_bookings.sql.

export const VEO_CAMERAS = ['VEO 1', 'VEO 2'] as const;
export type VeoCamera = (typeof VEO_CAMERAS)[number];

// Each camera's Veo number (on the device and in the Veo app). Shown
// alongside the name everywhere; the stored value stays "VEO 1" / "VEO 2"
// (the database check constraint and past bookings use those).
export const VEO_CAMERA_IDS: Record<VeoCamera, string> = {
  'VEO 1': '#140391',
  'VEO 2': '#140426',
};

// "VEO 1" -> "VEO 1 (#140391)". Accepts any string so it can label rows
// read back from the database.
export const veoCameraLabel = (camera: string) => {
  const id = (VEO_CAMERA_IDS as Record<string, string>)[camera];
  return id ? `${camera} (${id})` : camera;
};

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
