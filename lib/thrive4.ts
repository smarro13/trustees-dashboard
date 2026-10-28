import { nameKey } from './membership';
import type { ImportedLoveAdminPayment } from './importers/loveAdminImportParser';

// LoveAdmin migration (temporary) — see LOVEADMIN_MIGRATION.md.
//
// Fetches paid invoices from Thrive4 (LoveAdmin's new name, club.thrive4.com),
// the same invoices as the "Invoices All Report" an admin downloads and
// uploads on /operations/membership, for the previous calendar month only.
// Server-side only (lib/thrive4Sync.ts).
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
// Thrive4 is asked for the last 3 months (a period it offers), and only the
// previous calendar month's invoices are kept (previousMonth below): the club
// is moving off Thrive4, so only who paid there last month matters.
const DATE_FILTER = 'last 3 months';

// First and last day of the previous calendar month, as YYYY-MM-DD.
export function previousMonth(today = new Date()): { from: string; to: string } {
  const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  const last = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}
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
  // The month covered, e.g. { from: '2026-09-01', to: '2026-09-30' }.
  month: { from: string; to: string };
};

const INVOICES_PATH = '/services/payment/invoices/organisation/datefilter';
const SUBSCRIPTIONS_PATH = '/services/payment/organisation/purchase-orders/outstanding/date-filter';

// Both lists take the same filter as Thrive4's own report pages.
async function listByDate<T>(session: Session, path: string, dateFilter: string, what: string): Promise<T[]> {
  const response = await call(
    `${THRIVE4}${path}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dateFilter,
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
  if (!response.ok) throw new Thrive4Error(`Thrive4 wouldn’t return the ${what} (${response.status}).`);
  const rows = (await response.json().catch(() => null)) as T[] | null;
  if (!Array.isArray(rows)) throw new Thrive4Error(`Thrive4 returned something other than a list of ${what}.`);
  return rows;
}

export async function fetchThrive4Payments(): Promise<Thrive4Invoices> {
  const session = await signIn();

  const invoices = await listByDate<Invoice>(session, INVOICES_PATH, DATE_FILTER, 'invoices');

  const month = previousMonth();
  const inMonth = invoices.filter((i) => {
    const day = (i.invoiceDate ?? '').slice(0, 10);
    return day >= month.from && day <= month.to;
  });

  // Newest first, so each person keeps their latest paid invoice.
  inMonth.sort((a, b) => String(b.invoiceDate ?? '').localeCompare(String(a.invoiceDate ?? '')));

  // One row per person, by their Thrive4 id: two people with the same name
  // stay separate, and a child on several invoices counts once.
  const payments = new Map<string, Thrive4Invoices['payments'][number]>();
  let paidInvoices = 0;
  let skippedInvoices = 0;
  for (const invoice of inMonth) {
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
  return { payments: [...payments.values()], paidInvoices, skippedInvoices, month };
}

// ── What Thrive4 is still billing (the Thrive4 billing card on /operations/membership) ──

// A subscription ("purchase order") that will raise the next monthly invoice.
type Subscription = {
  id: number;
  beneficiaryGuid: string | null;
  firstName: string | null; // the person it's for
  lastName: string | null;
  userFirstName: string | null; // who pays (the account owner)
  userLastName: string | null;
  description: string | null;
  grossAmountPostDiscount: number | null;
  payableDate: string | null;
  autoRenew: boolean | null;
  doNotRenewOrder: boolean | null;
};

export type Thrive4BillingPerson = {
  person_guid: string;
  name: string;
  payer: string | null;
  // Subscriptions due to raise the next invoice.
  upcoming: { id: number; description: string | null; amount: number | null; payable_date: string | null }[];
  // This month's invoices: already raised.
  invoiced: { id: number; date: string | null; amount: number | null; status: string | null }[];
};

const fullName = (first: string | null, last: string | null) => [first, last].filter(Boolean).join(' ').trim();

// Everyone Thrive4 has invoiced this month or will invoice next, by Thrive4 id.
// Read only: nothing in Thrive4 is changed.
export async function fetchThrive4Billing(): Promise<Thrive4BillingPerson[]> {
  const session = await signIn();
  const [subscriptions, invoices] = await Promise.all([
    // "all" returns every outstanding subscription (the next month's invoices).
    listByDate<Subscription>(session, SUBSCRIPTIONS_PATH, 'all', 'subscriptions'),
    listByDate<Invoice>(session, INVOICES_PATH, 'this month', 'invoices'),
  ]);

  const people = new Map<string, Thrive4BillingPerson>();
  const person = (guid: string, name: string, payer: string | null) => {
    let p = people.get(guid);
    if (!p) {
      p = { person_guid: guid, name, payer, upcoming: [], invoiced: [] };
      people.set(guid, p);
    }
    return p;
  };

  for (const s of subscriptions) {
    if (!s.beneficiaryGuid || s.doNotRenewOrder) continue;
    person(s.beneficiaryGuid, fullName(s.firstName, s.lastName), fullName(s.userFirstName, s.userLastName) || null).upcoming.push({
      id: s.id,
      description: s.description,
      amount: s.grossAmountPostDiscount,
      payable_date: s.payableDate ? s.payableDate.slice(0, 10) : null,
    });
  }
  for (const i of invoices) {
    for (const b of i.beneficiaryDetail ?? []) {
      if (!b.person_guid) continue;
      person(b.person_guid, (b.person_name ?? '').trim(), fullName(i.firstName, i.lastName) || null).invoiced.push({
        id: i.id,
        date: i.invoiceDate ? i.invoiceDate.slice(0, 10) : null,
        amount: i.totalGrossAmount,
        status: i.reconciliationStatus,
      });
    }
  }
  return [...people.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// ── Making someone inactive on Thrive4 (the "Make inactive" buttons) ──

// Does what Thrive4's own "make inactive" does for a person (the one an
// invoice is for, not the payer): their outstanding subscriptions are dropped,
// so no more invoices are raised. Thrive4 sends this as a DELETE with
// inactive: true. It is ALWAYS sent with inactive: true here; the same call
// without it may delete the person outright.
//
// One request per person, so one failure doesn't stop the rest.
export async function makeThrive4Inactive(personGuids: string[]): Promise<{ person_guid: string; ok: boolean; error?: string }[]> {
  const session = await signIn();
  const results: { person_guid: string; ok: boolean; error?: string }[] = [];
  for (const guid of personGuids) {
    const response = await call(
      `${THRIVE4}/services/registration/person`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personGuids: [guid], inactive: true }),
      },
      session,
    ).catch((e: Error) => e);
    if (response instanceof Error) results.push({ person_guid: guid, ok: false, error: response.message });
    else if (!response.ok) results.push({ person_guid: guid, ok: false, error: `Thrive4 said no (${response.status}).` });
    else results.push({ person_guid: guid, ok: true });
  }
  return results;
}
