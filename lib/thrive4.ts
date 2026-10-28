import { nameKey } from './membership';
import type { ImportedLoveAdminPayment } from './importers/loveAdminImportParser';

// LoveAdmin migration (temporary) — see LOVEADMIN_MIGRATION.md.
//
// Fetches paid invoices from Thrive4 (LoveAdmin's new name, club.thrive4.com),
// the same invoices as the "Invoices All Report" an admin downloads and
// uploads on /operations/membership. Server-side only (lib/thrive4Sync.ts).
//
// Thrive4's web app talks to a JSON API, which this calls with the
// dashboard's own login (THRIVE4_EMAIL / THRIVE4_PASSWORD):
//   1. POST /authenticate              email + password -> token, session id
//   2. GET  /refreshtokenfororg        swaps them for ones tied to the club
//   3. POST /services/payment/invoices/organisation/datefilter
//                                      the invoices, as JSON
// Only names, invoice dates and amounts are kept.

const THRIVE4 = 'https://club.thrive4.com';
const TIMEOUT_MS = 45000;
// The club's organisation id in Thrive4 (not a secret: it's in every request).
const ORG_GUID = process.env.THRIVE4_ORG_GUID || '00cf34d8-ba98-4eee-a9b4-e0fa14c2a087';
// The same period as the report's default. Invoices are monthly, so three
// months covers everyone still paying through LoveAdmin.
const DATE_FILTER = 'last 3 months';
const PAID_STATUS = 'reconciled';

export class Thrive4Error extends Error {}

type Session = { token: string; sessionId: string };

type Invoice = {
  id: number;
  invoiceDate: string | null;
  firstName: string | null;
  lastName: string | null;
  totalGrossAmount: number | null;
  amountPaid: number | null;
  reconciliationStatus: string | null;
  beneficiaryDetail: { person_name: string; person_guid: string }[] | null;
};

async function call(url: string, init: RequestInit, session?: Session) {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (session) {
    headers.set('Authorization', `Bearer ${session.token}`);
    headers.set('la-session-id', session.sessionId);
    headers.set('la-org-guid', ORG_GUID);
  }
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new Thrive4Error('Thrive4 didn’t respond. Try again later.');
  }
  return response;
}

async function readSession(response: Response, step: string): Promise<Session> {
  const body = await response.json().catch(() => null);
  if (!body?.token || !body?.sessionId) throw new Thrive4Error(`Thrive4 ${step} didn’t return a session.`);
  return { token: body.token, sessionId: body.sessionId };
}

async function signIn(): Promise<Session> {
  const username = process.env.THRIVE4_EMAIL;
  const password = process.env.THRIVE4_PASSWORD;
  if (!username || !password) throw new Thrive4Error('THRIVE4_EMAIL and THRIVE4_PASSWORD aren’t set.');

  const login = await call(`${THRIVE4}/authenticate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (login.status === 401) throw new Thrive4Error('Thrive4 didn’t accept the login. Check THRIVE4_EMAIL and THRIVE4_PASSWORD.');
  if (!login.ok) throw new Thrive4Error(`Thrive4 sign-in failed (${login.status}).`);
  const first = await readSession(login, 'sign-in');

  const forOrg = await call(`${THRIVE4}/refreshtokenfororg`, { method: 'GET' }, first);
  if (!forOrg.ok) throw new Thrive4Error(`Thrive4 couldn’t open the club (${forOrg.status}). Does the login have admin access to Aldwinians?`);
  return readSession(forOrg, 'club sign-in');
}

export type Thrive4Invoices = {
  payments: (ImportedLoveAdminPayment & { person_guid: string })[];
  paidInvoices: number;
  skippedInvoices: number;
};

export async function fetchThrive4Payments(): Promise<Thrive4Invoices> {
  const session = await signIn();

  const response = await call(
    `${THRIVE4}/services/payment/invoices/organisation/datefilter`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dateFilter: DATE_FILTER,
        startDate: null,
        endDate: null,
        productGuids: null,
        scheduleIds: [],
        addressIds: [],
        cancelledInvoices: false,
        settlement: false,
        hideZeroValue: true,
        orgGuid: ORG_GUID,
      }),
    },
    session,
  );
  if (!response.ok) throw new Thrive4Error(`Thrive4 wouldn’t return the invoices (${response.status}).`);
  const invoices = (await response.json().catch(() => null)) as Invoice[] | null;
  if (!Array.isArray(invoices)) throw new Thrive4Error('Thrive4 returned something other than an invoice list.');

  // Newest first, so each person keeps their latest paid invoice.
  invoices.sort((a, b) => String(b.invoiceDate ?? '').localeCompare(String(a.invoiceDate ?? '')));

  // One row per person, by their Thrive4 id: two people with the same name
  // stay separate, and a child on several invoices counts once.
  const payments = new Map<string, Thrive4Invoices['payments'][number]>();
  let paidInvoices = 0;
  let skippedInvoices = 0;
  for (const invoice of invoices) {
    if ((invoice.reconciliationStatus ?? '').toLowerCase() !== PAID_STATUS || !(invoice.amountPaid ?? 0)) {
      skippedInvoices += 1;
      continue;
    }
    paidInvoices += 1;
    const payer = [invoice.firstName, invoice.lastName].filter(Boolean).join(' ').trim() || null;
    for (const b of invoice.beneficiaryDetail ?? []) {
      const beneficiary = (b.person_name ?? '').trim();
      if (!beneficiary || !b.person_guid || payments.has(b.person_guid)) continue;
      payments.set(b.person_guid, {
        person_guid: b.person_guid,
        name_key: nameKey(beneficiary, ''),
        beneficiary,
        payer,
        invoice: String(invoice.id),
        invoice_date: invoice.invoiceDate ? invoice.invoiceDate.slice(0, 10) : null,
        invoice_amount: invoice.totalGrossAmount ?? null,
        received: invoice.amountPaid ?? null,
      });
    }
  }
  return { payments: [...payments.values()], paidInvoices, skippedInvoices };
}
