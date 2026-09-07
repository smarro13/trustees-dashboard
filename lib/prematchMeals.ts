import { supabase } from './supabaseClient';

export type ProductStat = {
  productName: string;
  quantity: number;
  revenue: number;
};

export type OrderLineItem = {
  orderId: string;
  orderNumber: string;
  createdOn: string;
  customerName: string;
  customerEmail: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineRevenue: number;
  fulfillmentStatus: string;
  paymentState: string;
};

export type AnalyticsResponse = {
  ok: boolean;
  error?: string;
  dateRange?: { from: string; to: string };
  productFilter?: string;
  totalOrdersScanned?: number;
  matchedOrderCount?: number;
  totalQuantity?: number;
  totalRevenue?: number;
  currency?: string;
  byProduct?: ProductStat[];
  orders?: OrderLineItem[];
  generatedAt?: string;
};

export const DAY_PRESETS = [
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'Last 6 months', days: 182 },
  { label: 'Last 12 months', days: 365 },
];

export const formatCurrency = (value: number, currency: string) => {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(value);
  } catch {
    return `£${value.toFixed(2)}`;
  }
};

export const fetchPrematchMealsAnalytics = async (
  days: number,
  productFilter: string,
): Promise<{ ok: boolean; payload?: AnalyticsResponse; error?: string }> => {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  if (!token) {
    return { ok: false, error: 'You are not logged in.' };
  }

  const params = new URLSearchParams({ days: String(days), productFilter });

  try {
    const response = await fetch(`/api/private/prematch-meals-orders?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = (await response.json()) as AnalyticsResponse;

    if (!response.ok || !payload.ok) {
      return { ok: false, error: payload.error || 'Failed to load sales analytics.' };
    }

    return { ok: true, payload };
  } catch {
    return { ok: false, error: 'Failed to reach the analytics API.' };
  }
};

// Deterministic pastel-ish colour for a buyer's initials avatar, based on their name.
const AVATAR_PALETTE = [
  'bg-red-100 text-red-700',
  'bg-amber-100 text-amber-700',
  'bg-emerald-100 text-emerald-700',
  'bg-blue-100 text-blue-700',
  'bg-indigo-100 text-indigo-700',
  'bg-purple-100 text-purple-700',
  'bg-pink-100 text-pink-700',
  'bg-teal-100 text-teal-700',
];

export const getAvatarClass = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
};

export const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

export const buyersForProduct = (orders: OrderLineItem[], productName: string) => {
  const byName = new Map<string, number>();
  for (const order of orders) {
    if (order.productName !== productName) continue;
    byName.set(order.customerName, (byName.get(order.customerName) || 0) + order.quantity);
  }
  return [...byName.entries()]
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name));
};
