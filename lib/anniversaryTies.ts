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
  customerKey: string;
  customerName: string;
  customerEmail: string;
  productName: string;
  // e.g. "Size: Large" — Squarespace variant options (size/colour/etc) joined
  // into one string, so "what they ordered" is visible even when a size
  // variant isn't broken out as its own product name. Empty if none.
  variantDetail: string;
  quantity: number;
  unitPrice: number;
  lineRevenue: number;
  fulfillmentStatus: string;
  paymentState: string;
};

export type RepeatBuyer = {
  key: string;
  name: string;
  productCount: number;
  totalQuantity: number;
};

export type DiscountUsage = {
  orderId: string;
  orderNumber: string;
  createdOn: string;
  customerKey: string;
  customerName: string;
  customerEmail: string;
  promoCode: string;
  discountName: string;
  amount: number;
  productNames: string[];
};

export type AnalyticsResponse = {
  ok: boolean;
  error?: string;
  dateRange?: { from: string; to: string };
  productFilter?: string;
  excludeUnitPrice?: number | null;
  totalOrdersScanned?: number;
  matchedOrderCount?: number;
  totalQuantity?: number;
  totalRevenue?: number;
  currency?: string;
  byProduct?: ProductStat[];
  repeatBuyers?: RepeatBuyer[];
  discountUsage?: DiscountUsage[];
  orders?: OrderLineItem[];
  generatedAt?: string;
};

export const DAY_PRESETS = [
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'Last 6 months', days: 182 },
  { label: 'Last 12 months', days: 365 },
  { label: 'Since launch (2 years)', days: 730 },
];

export const formatCurrency = (value: number, currency: string) => {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(value);
  } catch {
    return `£${value.toFixed(2)}`;
  }
};

export const fetchAnniversaryTiesAnalytics = async (
  days: number,
  productFilter: string,
  excludeUnitPrice?: string,
): Promise<{ ok: boolean; payload?: AnalyticsResponse; error?: string }> => {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  if (!token) {
    return { ok: false, error: 'You are not logged in.' };
  }

  const params = new URLSearchParams({ days: String(days), productFilter });
  if (excludeUnitPrice && excludeUnitPrice.trim()) {
    params.set('excludeUnitPrice', excludeUnitPrice.trim());
  }

  try {
    const response = await fetch(`/api/private/anniversary-ties-orders?${params.toString()}`, {
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

// Marks the WHOLE Squarespace order as fulfilled (Squarespace has no
// per-line-item fulfillment) — every item on the order is affected, not just
// the tie. Shared with lib/prematchMeals.ts's identical helper via the same
// API route; kept duplicated here rather than imported so this file has no
// cross-feature dependency.
export const markOrderFulfilled = async (orderId: string): Promise<{ ok: boolean; error?: string }> => {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  if (!token) {
    return { ok: false, error: 'You are not logged in.' };
  }

  try {
    const response = await fetch('/api/private/mark-order-fulfilled', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ orderId }),
    });
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      return { ok: false, error: payload.error || 'Failed to mark the order as fulfilled.' };
    }

    return { ok: true };
  } catch {
    return { ok: false, error: 'Failed to reach the fulfillment API.' };
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
  const byCustomer = new Map<string, { key: string; name: string; quantity: number }>();
  for (const order of orders) {
    if (order.productName !== productName) continue;
    const existing = byCustomer.get(order.customerKey) || { key: order.customerKey, name: order.customerName, quantity: 0 };
    existing.quantity += order.quantity;
    byCustomer.set(order.customerKey, existing);
  }
  return [...byCustomer.values()].sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name));
};

export const discountsForProduct = (discountUsage: DiscountUsage[], productName: string) =>
  discountUsage
    .filter((usage) => usage.productNames.includes(productName))
    .sort((a, b) => new Date(b.createdOn).getTime() - new Date(a.createdOn).getTime());

// Maps customerKey -> the promo code(s) they used for this specific product, so
// the buyer list can flag "this order was discounted" per person.
export const discountCodesByCustomerForProduct = (discountUsage: DiscountUsage[], productName: string) => {
  const map = new Map<string, string[]>();
  for (const usage of discountsForProduct(discountUsage, productName)) {
    const codes = map.get(usage.customerKey) || [];
    codes.push(usage.promoCode);
    map.set(usage.customerKey, codes);
  }
  return map;
};
