// Shared settings for VEO camera bookings — used by the public booking page,
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

export type VeoBookingStatus = 'booked' | 'out' | 'returned' | 'cancelled';

// What the public page is allowed to see about other bookings (no contact details).
export type PublicVeoBooking = {
  id: string;
  camera: VeoCamera;
  booked_by: string; // first name only
  team_name: string;
  purpose: VeoPurpose;
  fixture: string | null;
  time_out: string;
  time_in: string;
  status: VeoBookingStatus;
};

export const formatVeoTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/London',
  });
