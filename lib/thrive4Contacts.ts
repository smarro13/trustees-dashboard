import { nameKey } from './membership';

// LoveAdmin migration (temporary) — see LOVEADMIN_MIGRATION.md.
//
// Looks up LoveAdmin payers' contact details (mobile, email) in Thrive4
// (LoveAdmin's new name, club.thrive4.com), for "Text payers about moving to
// ClubControl" (lib/smsCampaign.ts). That's all it does: who to contact comes
// from the uploaded LoveAdmin report, as for the rest of the page, and nothing
// else is read from Thrive4 or changed there. Server-side only.
//
// Thrive4's web app talks to a JSON API, which this calls read-only with the
// dashboard's Thrive4 login (THRIVE4_EMAIL / THRIVE4_PASSWORD):
//   1. POST /authenticate, then GET /refreshtokenfororg   sign in to the club
//   2. POST /services/payment/invoices/organisation/datefilter
//        recent invoices, to find each payer's Thrive4 id by their name
//   3. GET  /services/person/<id>                          their phone numbers and email

const THRIVE4 = 'https://club.thrive4.com';
const TIMEOUT_MS = 45000;
const ORG_GUID = process.env.THRIVE4_ORG_GUID || '00cf34d8-ba98-4eee-a9b4-e0fa14c2a087';

export class Thrive4Error extends Error {}

export const thrive4Configured = () => !!(process.env.THRIVE4_EMAIL && process.env.THRIVE4_PASSWORD);

type Session = { token: string; sessionId: string };

async function call(path: string, init: RequestInit, session?: Session) {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (session) {
    headers.set('Authorization', `Bearer ${session.token}`);
    headers.set('la-session-id', session.sessionId);
    headers.set('la-org-guid', ORG_GUID);
  }
  try {
    return await fetch(`${THRIVE4}${path}`, { ...init, headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new Thrive4Error('Thrive4 didn’t respond. Try again later.');
  }
}

async function readSession(response: Response, step: string): Promise<Session> {
  const body = await response.json().catch(() => null);
  if (!body?.token || !body?.sessionId) throw new Thrive4Error(`Thrive4 ${step} didn’t return a session.`);
  return { token: body.token, sessionId: body.sessionId };
}

async function signIn(): Promise<Session> {
  const username = process.env.THRIVE4_EMAIL;
  const password = process.env.THRIVE4_PASSWORD;
  if (!username || !password) throw new Thrive4Error('THRIVE4_EMAIL and THRIVE4_PASSWORD aren’t set, so contact details can’t be looked up.');
  const login = await call('/authenticate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  if (login.status === 401) throw new Thrive4Error('Thrive4 didn’t accept the login. Check THRIVE4_EMAIL and THRIVE4_PASSWORD.');
  if (!login.ok) throw new Thrive4Error(`Thrive4 sign-in failed (${login.status}).`);
  const first = await readSession(login, 'sign-in');
  const forOrg = await call('/refreshtokenfororg', { method: 'GET' }, first);
  if (!forOrg.ok) throw new Thrive4Error(`Thrive4 couldn’t open the club (${forOrg.status}).`);
  return readSession(forOrg, 'club sign-in');
}

// A UK mobile number in international form (+447…), or null.
export const ukMobile = (raw: string | null | undefined): string | null => {
  const digits = (raw ?? '').replace(/[^\d+]/g, '');
  const national = digits.startsWith('+44') ? `0${digits.slice(3)}` : digits.startsWith('44') ? `0${digits.slice(2)}` : digits;
  return /^07\d{9}$/.test(national) ? `+44${national.slice(1)}` : null;
};

export type PayerContact = { mobile: string | null; email: string | null };

// Contact details for each payer name (as the LoveAdmin report writes it),
// keyed by nameKey. A payer not found on Thrive4's recent invoices is left out.
export async function fetchPayerContacts(payerNames: string[]): Promise<Map<string, PayerContact>> {
  const wanted = new Set(payerNames.map((n) => nameKey(n, '')).filter(Boolean));
  const contacts = new Map<string, PayerContact>();
  if (wanted.size === 0) return contacts;
  const session = await signIn();

  // Payers' Thrive4 ids, from the last few months' invoices (the account owner
  // on each invoice is the payer).
  const response = await call(
    '/services/payment/invoices/organisation/datefilter',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dateFilter: 'last 3 months', startDate: null, endDate: null, productGuids: null, scheduleIds: [], addressIds: [],
        cancelledInvoices: false, settlement: false, hideZeroValue: true, orgGuid: ORG_GUID,
      }),
    },
    session,
  );
  if (!response.ok) throw new Thrive4Error(`Thrive4 wouldn’t return the invoices (${response.status}).`);
  const invoices = (await response.json().catch(() => null)) as { firstName?: string; lastName?: string; payeeGuid?: string }[] | null;
  if (!Array.isArray(invoices)) throw new Thrive4Error('Thrive4 returned something other than an invoice list.');
  const guidByName = new Map<string, string>();
  for (const i of invoices) {
    const key = nameKey([i.firstName, i.lastName].filter(Boolean).join(' '), '');
    if (i.payeeGuid && wanted.has(key) && !guidByName.has(key)) guidByName.set(key, i.payeeGuid);
  }

  // Each payer's own record: a number marked mobile first, else any UK
  // mobile they have; and their email.
  const entries = [...guidByName];
  for (let i = 0; i < entries.length; i += 8) {
    await Promise.all(entries.slice(i, i + 8).map(async ([key, guid]) => {
      const res = await call(`/services/person/${guid}`, { method: 'GET' }, session).catch(() => null);
      if (!res?.ok) return;
      const person = await res.json().catch(() => null);
      const numbers: { phoneNumber?: string; phoneNumberType?: string }[] = person?.phoneNumbers ?? [];
      const sorted = [...numbers].sort((a, b) => Number(b.phoneNumberType === 'mobile') - Number(a.phoneNumberType === 'mobile'));
      const mobile = sorted.map((n) => ukMobile(n.phoneNumber)).find(Boolean) ?? null;
      const email = typeof person?.email === 'string' && person.email.includes('@') ? person.email.trim() : null;
      contacts.set(key, { mobile, email });
    }));
  }
  return contacts;
}
