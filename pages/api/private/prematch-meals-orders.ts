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
type SquarespaceOrder = {
  id: string;
  orderNumber: string;
  createdOn: string;
  customerEmail: string;
  billingAddress?: SquarespaceAddress;
  shippingAddress?: SquarespaceAddress;
  fulfillmentStatus: string;
  paymentState: string;
  lineItems: SquarespaceLineItem[];
};

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
    const byCustomer = new Map<string, { orderIds: Set<string>; quantity: number }>();
    const lineItemDetails: Array<{
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
    }> = [];

    for (const order of orders) {
      // Skip cancelled orders and orders that were never actually paid for.
      if (order.fulfillmentStatus === 'CANCELED') continue;
      if (order.paymentState && !['PAID', 'PARTIALLY_PAID', 'AUTHORIZED'].includes(order.paymentState)) continue;

      let matchedThisOrder = false;

      for (const item of order.lineItems || []) {
        if (!item.productName || !item.productName.toLowerCase().includes(productFilter)) continue;

        const unitPrice = parseFloat(item.unitPricePaid?.value || '0');
        if (excludeUnitPrice !== null && Math.abs(unitPrice - excludeUnitPrice) < 0.001) continue;

        matchedThisOrder = true;
        const qty = item.quantity || 0;
        const lineRevenue = qty * unitPrice;

        totalQuantity += qty;
        totalRevenue += lineRevenue;
        if (item.unitPricePaid?.currency) currency = item.unitPricePaid.currency;

        const existing = byProduct.get(item.productName) || { quantity: 0, revenue: 0 };
        existing.quantity += qty;
        existing.revenue += lineRevenue;
        byProduct.set(item.productName, existing);

        const customerName = getCustomerName(order);
        const customerEntry = byCustomer.get(customerName) || { orderIds: new Set<string>(), quantity: 0 };
        customerEntry.orderIds.add(order.id);
        customerEntry.quantity += qty;
        byCustomer.set(customerName, customerEntry);

        lineItemDetails.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          createdOn: order.createdOn,
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

      if (matchedThisOrder) matchedOrderCount += 1;
    }

    lineItemDetails.sort((a, b) => new Date(b.createdOn).getTime() - new Date(a.createdOn).getTime());

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
      // Buyers who've ordered across more than one order in this date range —
      // i.e. the regulars, not one-off buyers.
      regularAttendees: [...byCustomer.entries()]
        .map(([name, stats]) => ({ name, orderCount: stats.orderIds.size, totalQuantity: stats.quantity }))
        .filter((r) => r.orderCount >= 2)
        .sort((a, b) => b.orderCount - a.orderCount || b.totalQuantity - a.totalQuantity),
      orders: lineItemDetails,
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Pre-match meals analytics error:', err);
    return res.status(502).json({ ok: false, error: err?.message || 'Failed to fetch Squarespace orders.' });
  }
}
