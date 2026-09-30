// Shared settings for the asset register (/operations/asset-register).
// Schema: supabase/policies/asset_register.sql — the fixed lists below must
// match its check constraints.

export const ASSET_CATEGORIES = [
  'IT & computers',
  'AV, screens & cameras',
  'Networking & phones',
  'Software & subscriptions',
  'Bar & kitchen',
  'Gym equipment',
  'Grounds & pitch',
  'Rugby & training kit',
  'Furniture & fixtures',
  'Vehicles & machinery',
  'Safety & first aid',
  'Other',
] as const;

export const ASSET_OWNERS = ['Club', 'Trading company (Ltd)'] as const;
export const ASSET_CONDITIONS = ['New', 'Good', 'Fair', 'Poor', 'Out of service'] as const;
export const ASSET_STATUSES = ['In use', 'In storage', 'On loan', 'Under repair', 'Disposed'] as const;
export const RENEWAL_FREQUENCIES = ['One-off', 'Monthly', 'Quarterly', 'Annually', 'Every 2 years', 'Every 3 years'] as const;

// Suggestions only — the fields accept any text.
export const RENEWAL_TYPES = ['Subscription', 'Licence', 'Support contract', 'Insurance', 'Lease', 'Domain / hosting'];
export const SERVICE_TYPES = ['Service', 'PAT test', 'Inspection', 'Calibration', 'MOT', 'Fire extinguisher service', 'Defibrillator check'];

export type Asset = {
  id: string;
  name: string;
  category: string;
  location: string | null;
  make_model: string | null;
  serial_number: string | null;
  asset_tag: string | null;
  owner_entity: string;
  responsible_person: string | null;
  condition: string;
  status: string;
  supplier: string | null;
  purchase_date: string | null;
  purchase_cost: number | null;
  document_url: string | null;
  renewal_type: string | null;
  renewal_date: string | null;
  renewal_cost: number | null;
  renewal_frequency: string | null;
  auto_renews: boolean;
  warranty_expires: string | null;
  next_service_date: string | null;
  service_type: string | null;
  disposed_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

export type AssetDateKind = 'renewal' | 'warranty' | 'service';

export type AssetDueItem = {
  asset: Asset;
  kind: AssetDateKind;
  label: string;
  date: string;
  daysAway: number; // negative = overdue
};

// Days from today (UK) to a YYYY-MM-DD date.
export const daysUntil = (isoDate: string) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${isoDate}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
};

// Every upcoming or overdue date across active (not disposed) assets.
export const getDueItems = (assets: Asset[]): AssetDueItem[] =>
  assets
    .filter((a) => a.status !== 'Disposed')
    .flatMap((a) => {
      const items: AssetDueItem[] = [];
      if (a.renewal_date) items.push({ asset: a, kind: 'renewal', label: a.renewal_type || 'Renewal', date: a.renewal_date, daysAway: daysUntil(a.renewal_date) });
      if (a.warranty_expires) items.push({ asset: a, kind: 'warranty', label: 'Warranty ends', date: a.warranty_expires, daysAway: daysUntil(a.warranty_expires) });
      if (a.next_service_date) items.push({ asset: a, kind: 'service', label: a.service_type || 'Service due', date: a.next_service_date, daysAway: daysUntil(a.next_service_date) });
      return items;
    })
    .sort((x, y) => x.daysAway - y.daysAway);

// The soonest date on an asset, for the "Next date" column.
export const nextDueFor = (asset: Asset) => getDueItems([asset])[0] ?? null;

export const formatAssetDate = (isoDate: string | null) =>
  isoDate ? new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const formatMoney = (value: number | null) =>
  value == null ? '—' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value);

export const describeDaysAway = (days: number) => {
  if (days < 0) return `${-days} day${days === -1 ? '' : 's'} overdue`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
};

// CSV export of the given assets (Excel-friendly: BOM + quoted fields).
export const assetsToCsv = (assets: Asset[]) => {
  const columns: [string, (a: Asset) => unknown][] = [
    ['Name', (a) => a.name],
    ['Category', (a) => a.category],
    ['Owner', (a) => a.owner_entity],
    ['Location', (a) => a.location],
    ['Make / model', (a) => a.make_model],
    ['Serial number', (a) => a.serial_number],
    ['Asset tag', (a) => a.asset_tag],
    ['Responsible', (a) => a.responsible_person],
    ['Condition', (a) => a.condition],
    ['Status', (a) => a.status],
    ['Supplier', (a) => a.supplier],
    ['Purchase date', (a) => a.purchase_date],
    ['Purchase cost', (a) => a.purchase_cost],
    ['Renewal type', (a) => a.renewal_type],
    ['Renewal date', (a) => a.renewal_date],
    ['Renewal cost', (a) => a.renewal_cost],
    ['Renewal frequency', (a) => a.renewal_frequency],
    ['Auto-renews', (a) => (a.auto_renews ? 'Yes' : 'No')],
    ['Warranty expires', (a) => a.warranty_expires],
    ['Service type', (a) => a.service_type],
    ['Next service', (a) => a.next_service_date],
    ['Disposed date', (a) => a.disposed_date],
    ['Document', (a) => a.document_url],
    ['Notes', (a) => a.notes],
  ];
  // Prefix text that Excel would treat as a formula (CSV injection).
  const cell = (value: unknown) => {
    const raw = String(value ?? '');
    const safe = typeof value === 'string' && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const lines = [
    columns.map(([h]) => cell(h)).join(','),
    ...assets.map((a) => columns.map(([, get]) => cell(get(a))).join(',')),
  ];
  return `﻿${lines.join('\r\n')}`;
};
