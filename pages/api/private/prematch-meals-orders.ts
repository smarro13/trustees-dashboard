import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// Kept local (not imported from lib/roles.ts) because this is a server-side
// API route — see lib/presidentPermissions.ts note on why client-side
// Supabase helpers aren't imported into API routes.
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

// Who can view Pre-Match Meals sales analytics — mirrors canRoleViewAgendaHref
// in lib/roles.ts for '/agenda/prematch-meals'.
const ALLOWED_ROLES: DashboardRole[] = ['admin', 'trustee', 'director', 'president', 'commercial'];

const getBearerToken = (req: NextApiRequest) => {
  const authHeader = req.headers.authorization;
  return typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : '';
};

type SquarespaceMoney = { currency: string; value: string };
type SquarespaceLineItem = {
  productName: string;
  quantity: number;
  unitPricePaid: SquarespaceMoney;
};
type SquarespaceAddress = { firstName?: string; lastName?: string };
type SquarespaceDiscountLine = {
  promoCode?: string;
  name?: string;
  amount?: SquarespaceMoney;
};
type SquarespaceOrder = {
  id: string;
  orderNumber: string;
  createdOn: string;
  customerId?: string;
  customerEmail: string;
  billingAddress?: SquarespaceAddress;
  shippingAddress?: SquarespaceAddress;
  fulfillmentStatus: string;
  paymentState: string;
  lineItems: SquarespaceLineItem[];
  subtotal?: SquarespaceMoney;
  discountTotal?: SquarespaceMoney;
  refundedTotal?: SquarespaceMoney;
  discountLines?: SquarespaceDiscountLine[];
};

// A line item's unitPricePaid is always the pre-discount list price — a
// promo code (e.g. a comped ticket) shows up only in the order's
// discountTotal/refundedTotal, not on the line item itself. Without this,
// a 100%-off comp order would still be counted as full-price revenue.
// This spreads the order's discount/refund proportionally across its lines.
const getOrderPaidRatio = (order: SquarespaceOrder): number => {
  const subtotal = parseFloat(order.subtotal?.value || '0');
  if (subtotal <= 0) return 1;

  const discount = parseFloat(order.discountTotal?.value || '0');
  const refunded = parseFloat(order.refundedTotal?.value || '0');
  const ratio = (subtotal - discount - refunded) / subtotal;

  return Math.max(0, Math.min(1, ratio));
};

// Squarespace's stable per-customer ID — this is what buyers must be grouped
// by. Display name/email alone aren't safe keys: two different customers can
// share a name, and the same customer's name can be entered slightly
// differently across orders.
const getCustomerKey = (order: SquarespaceOrder): string =>
  order.customerId || order.customerEmail || `unknown:${order.id}`;

const getCustomerName = (order: SquarespaceOrder): string => {
  const name = (addr?: SquarespaceAddress) =>
    addr && (addr.firstName || addr.lastName) ? `${addr.firstName || ''} ${addr.lastName || ''}`.trim() : '';

  return name(order.billingAddress) || name(order.shippingAddress) || order.customerEmail || 'Unknown';
};
type SquarespaceOrdersResponse = {
  result: SquarespaceOrder[];
  pagination?: { hasNextPage: boolean; nextPageCursor?: string };
};

const SQUARESPACE_ORDERS_URL = 'https://api.squarespace.com/1.0/commerce/orders';
const MAX_PAGES = 20; // 20 * 50 orders = up to 1000 orders per request, plenty for a season

async function fetchAllOrders(apiKey: string, modifiedAfter: string, modifiedBefore: string) {
  const orders: SquarespaceOrder[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(SQUARESPACE_ORDERS_URL);
    if (cursor) {
      url.searchParams.set('cursor', cursor);
    } else {
      url.searchParams.set('modifiedAfter', modifiedAfter);
      url.searchParams.set('modifiedBefore', modifiedBefore);
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'User-Agent': 'Aldwinians Trustees Dashboard (pre-match-meals analytics)',
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Squarespace API error ${response.status}: ${body || response.statusText}`);
    }

    const data = (await response.json()) as SquarespaceOrdersResponse;
    orders.push(...(data.result || []));

    if (data.pagination?.hasNextPage && data.pagination.nextPageCursor) {
      cursor = data.pagination.nextPageCursor;
    } else {
      break;
    }
  }

  return orders;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const { data: { user: requestingUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !requestingUser) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const role = resolveRole(requestingUser);
  if (!ALLOWED_ROLES.includes(role)) {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  }

  const apiKey = process.env.SQUARESPACE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ ok: false, error: 'SQUARESPACE_API_KEY is not configured on the server.' });
  }

  const daysParam = typeof req.query.days === 'string' ? parseInt(req.query.days, 10) : 90;
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 730) : 90;
  const productFilter = typeof req.query.productFilter === 'string' && req.query.productFilter.trim()
    ? req.query.productFilter.trim().toLowerCase()
    : 'pre match';

  // Lets the caller drop low-value add-on line items (e.g. a 50p extra) that
  // aren't actual meal sales but would otherwise show up as a "product".
  const excludeUnitPrice = typeof req.query.excludeUnitPrice === 'string' && req.query.excludeUnitPrice.trim()
    ? parseFloat(req.query.excludeUnitPrice)
    : null;

  const modifiedBefore = new Date().toISOString();
  const modifiedAfter = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  try {
    const orders = await fetchAllOrders(apiKey, modifiedAfter, modifiedBefore);

    let totalQuantity = 0;
    let totalRevenue = 0;
    let currency = 'GBP';
    let matchedOrderCount = 0;
    const byProduct = new Map<string, { quantity: number; revenue: number }>();
    // Tracks distinct events (products) each customer has bought into — a
    // "regular" is someone who's attended more than one event, not just
    // someone with multiple orders for the same one. Keyed by Squarespace's
    // stable customerId (see getCustomerKey), not display name.
    const byCustomer = new Map<string, { name: string; products: Set<string>; quantity: number }>();
    const lineItemDetails: Array<{
      orderId: string;
      orderNumber: string;
      createdOn: string;
      customerKey: string;
      customerName: string;
      customerEmail: string;
      productName: string;
      quantity: number;
      unitPrice: number;
      lineRevenue: number;
      fulfillmentStatus: string;
      paymentState: string;
    }> = [];
    const discountUsage: Array<{
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
    }> = [];

    for (const order of orders) {
      // Skip cancelled orders and orders that were never actually paid for.
      if (order.fulfillmentStatus === 'CANCELED') continue;
      if (order.paymentState && !['PAID', 'PARTIALLY_PAID', 'AUTHORIZED'].includes(order.paymentState)) continue;

      let matchedThisOrder = false;
      const matchedProductNames = new Set<string>();
      const paidRatio = getOrderPaidRatio(order);

      for (const item of order.lineItems || []) {
        if (!item.productName || !item.productName.toLowerCase().includes(productFilter)) continue;

        const unitPrice = parseFloat(item.unitPricePaid?.value || '0');
        if (excludeUnitPrice !== null && Math.abs(unitPrice - excludeUnitPrice) < 0.001) continue;

        matchedThisOrder = true;
        matchedProductNames.add(item.productName);
        const qty = item.quantity || 0;
        // unitPricePaid is always the pre-discount list price, so apply the
        // order's discount/refund ratio to get what was actually collected.
        const lineRevenue = qty * unitPrice * paidRatio;

        totalQuantity += qty;
        totalRevenue += lineRevenue;
        if (item.unitPricePaid?.currency) currency = item.unitPricePaid.currency;

        const existing = byProduct.get(item.productName) || { quantity: 0, revenue: 0 };
        existing.quantity += qty;
        existing.revenue += lineRevenue;
        byProduct.set(item.productName, existing);

        const customerName = getCustomerName(order);
        const customerKey = getCustomerKey(order);
        const customerEntry = byCustomer.get(customerKey) || { name: customerName, products: new Set<string>(), quantity: 0 };
        customerEntry.products.add(item.productName);
        customerEntry.quantity += qty;
        byCustomer.set(customerKey, customerEntry);

        lineItemDetails.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          createdOn: order.createdOn,
          customerKey,
          customerName,
          customerEmail: order.customerEmail || '',
          productName: item.productName,
          quantity: qty,
          unitPrice,
          lineRevenue: Math.round(lineRevenue * 100) / 100,
          fulfillmentStatus: order.fulfillmentStatus,
          paymentState: order.paymentState,
        });
      }

      if (matchedThisOrder) {
        matchedOrderCount += 1;

        // Record who used a discount code on this order — order-level, not
        // per line item, so this is recorded once per order, not once per item.
        for (const discountLine of order.discountLines || []) {
          const amount = parseFloat(discountLine.amount?.value || '0');
          if (amount <= 0) continue;

          discountUsage.push({
            orderId: order.id,
            orderNumber: order.orderNumber,
            createdOn: order.createdOn,
            customerKey: getCustomerKey(order),
            customerName: getCustomerName(order),
            customerEmail: order.customerEmail || '',
            promoCode: discountLine.promoCode || '(no code)',
            discountName: discountLine.name || '',
            amount: Math.round(amount * 100) / 100,
            productNames: [...matchedProductNames],
          });
        }
      }
    }

    lineItemDetails.sort((a, b) => new Date(b.createdOn).getTime() - new Date(a.createdOn).getTime());
    discountUsage.sort((a, b) => new Date(b.createdOn).getTime() - new Date(a.createdOn).getTime());

    return res.status(200).json({
      ok: true,
      dateRange: { from: modifiedAfter, to: modifiedBefore },
      productFilter,
      excludeUnitPrice,
      totalOrdersScanned: orders.length,
      matchedOrderCount,
      totalQuantity,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      currency,
      byProduct: [...byProduct.entries()]
        .map(([productName, stats]) => ({
          productName,
          quantity: stats.quantity,
          revenue: Math.round(stats.revenue * 100) / 100,
        }))
        .sort((a, b) => b.revenue - a.revenue),
      // Buyers who've bought into more than one distinct event (product) in
      // this date range — i.e. actual regulars, not just repeat orders for
      // the same one event.
      regularAttendees: [...byCustomer.entries()]
        .map(([key, stats]) => ({ key, name: stats.name, eventCount: stats.products.size, totalQuantity: stats.quantity }))
        .filter((r) => r.eventCount >= 2)
        .sort((a, b) => b.eventCount - a.eventCount || b.totalQuantity - a.totalQuantity),
      discountUsage,
      orders: lineItemDetails,
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Pre-match meals analytics error:', err);
    return res.status(502).json({ ok: false, error: err?.message || 'Failed to fetch Squarespace orders.' });
  }
}
