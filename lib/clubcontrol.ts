// Fetches the members export from ClubControl Hub, the same CSV an admin
// downloads from Reports → Members and uploads on /operations/membership.
// Server-side only (pages/api/private/clubcontrol-sync.ts).
//
// ClubControl has no API: it's a Laravel site with a normal login form, so
// this logs in with the dashboard's own account (CLUBCONTROL_EMAIL /
// CLUBCONTROL_PASSWORD), reads the Reports page to find the members export's
// download button, downloads the CSV, then logs out. It only ever reads:
// the login and logout forms are the only things it submits.
//
// The export has no payment details, so while logged in it also reads each
// member's "Billing Method" from the Members list (e.g. "Direct Debit:
// Active"), a page at a time. If that part fails the export still comes back,
// without billing methods.

const BASE = 'https://www.clubcontrolhub.co.uk';
const TIMEOUT_MS = 30000;
const USER_AGENT = 'AldwiniansTrusteesDashboard/1.0 (membership import)';

export class ClubControlError extends Error {}

type Jar = Map<string, string>;

const decodeHtml = (value: string) =>
  value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

// The hidden form token Laravel puts in every form.
const formToken = (html: string) => {
  const match = html.match(/name="_token"\s+value="([^"]+)"/) || html.match(/value="([^"]+)"\s+name="_token"/);
  return match ? match[1] : '';
};

async function request(jar: Jar, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('User-Agent', USER_AGENT);
  if (jar.size) headers.set('Cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '));

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new ClubControlError(`Couldn't reach ClubControl (${path}).`);
  }
  for (const cookie of res.headers.getSetCookie()) {
    const [pair] = cookie.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
  return res;
}

const isLoginPage = (res: Response) => {
  const location = res.headers.get('location') ?? '';
  return location.replace(BASE, '').startsWith('/login');
};

// The members export's address, taken from the Reports page: the form that
// submits to /reports/members, using its download button (not "Show").
function membersExportPath(reportsHtml: string): string {
  const start = reportsHtml.indexOf(`action="${BASE}/reports/members"`);
  if (start < 0) throw new ClubControlError('The Reports page no longer has the members export.');
  const form = reportsHtml.slice(start, reportsHtml.indexOf('</form>', start));
  const buttons = [...form.matchAll(/<button[^>]*>/gi)].map((m) => m[0]);
  const download = buttons.find((b) => /name="download"/i.test(b)) ?? buttons.find((b) => /download|export|csv/i.test(b));
  const name = download?.match(/name="([^"]+)"/)?.[1];
  if (!name) throw new ClubControlError("Couldn't find the members export's download button on the Reports page.");
  const value = decodeHtml(download?.match(/value="([^"]*)"/)?.[1] ?? '1');
  // No filters: every member, active or not, as the manual export is taken.
  return `/reports/members?${new URLSearchParams({ [name]: value })}`;
}

// Every member's "Billing Method" from the Members list (/members), by
// ClubControl's member id (the export's "Id" column). Pages are read a few at
// a time. Values seen: "Direct Debit: Active", "Direct Debit: Pending",
// "Card", "Inactive".
const PAGES_AT_ONCE = 5;
const MAX_PAGES = 200;

const cellText = (html: string) => decodeHtml(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());

function readMembersPage(html: string, column: number, into: Map<string, string>) {
  for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const id = row[1].match(/\/members\/(\d+)\//)?.[1];
    if (!id) continue;
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => cellText(m[1]));
    if (cells[column]) into.set(id, cells[column]);
  }
}

async function readBillingMethods(jar: Jar): Promise<Map<string, string>> {
  const first = await request(jar, '/members');
  if (first.status !== 200) throw new ClubControlError(`ClubControl's Members page returned ${first.status}.`);
  const html = await first.text();
  const headings = [...html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((m) => cellText(m[1]).toLowerCase());
  const column = headings.indexOf('billing method');
  if (column < 0) throw new ClubControlError('The Members page no longer has a Billing Method column.');
  const lastPage = Math.min(
    MAX_PAGES,
    Math.max(1, ...[...html.matchAll(/[?&]page=(\d+)/g)].map((m) => Number(m[1]))),
  );

  const billing = new Map<string, string>();
  readMembersPage(html, column, billing);
  for (let page = 2; page <= lastPage; page += PAGES_AT_ONCE) {
    const batch = [];
    for (let p = page; p < page + PAGES_AT_ONCE && p <= lastPage; p++) batch.push(p);
    const pages = await Promise.all(batch.map(async (p) => {
      const res = await request(jar, `/members?page=${p}`);
      if (res.status !== 200) throw new ClubControlError(`ClubControl's Members page ${p} returned ${res.status}.`);
      return res.text();
    }));
    for (const pageHtml of pages) readMembersPage(pageHtml, column, billing);
  }
  return billing;
}

// billingById: each member's Billing Method by member id, or null if the
// Members list couldn't be read.
export type ClubControlExport = { csv: string; fileName: string; billingById: Map<string, string> | null };

export async function fetchMembersExport(): Promise<ClubControlExport> {
  const email = process.env.CLUBCONTROL_EMAIL || '';
  const password = process.env.CLUBCONTROL_PASSWORD || '';
  if (!email || !password) {
    throw new ClubControlError('ClubControl isn’t connected yet: set CLUBCONTROL_EMAIL and CLUBCONTROL_PASSWORD.');
  }

  const jar: Jar = new Map();

  // 1. Log in.
  const loginPage = await request(jar, '/login');
  const loginToken = formToken(await loginPage.text());
  if (!loginToken) throw new ClubControlError('The ClubControl login page has changed (no form token).');

  const login = await request(jar, '/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ _token: loginToken, email, password }).toString(),
  });
  if (login.status < 300 || login.status >= 400 || isLoginPage(login)) {
    throw new ClubControlError('ClubControl rejected the login. Check CLUBCONTROL_EMAIL and CLUBCONTROL_PASSWORD.');
  }

  let logoutToken = '';
  try {
    // 2. Find the export on the Reports page.
    const reports = await request(jar, '/reports');
    if (reports.status !== 200) throw new ClubControlError(`ClubControl's Reports page returned ${reports.status}.`);
    const reportsHtml = await reports.text();
    logoutToken = formToken(reportsHtml);

    // 3. Download it.
    const exported = await request(jar, membersExportPath(reportsHtml));
    const type = exported.headers.get('content-type') ?? '';
    const disposition = exported.headers.get('content-disposition') ?? '';
    if (exported.status !== 200) throw new ClubControlError(`The members export returned ${exported.status}.`);
    if (type.includes('text/html') && !disposition) {
      throw new ClubControlError('The members export returned a web page instead of a CSV file.');
    }
    const csv = await exported.text();
    const fileName = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)?.[1] ?? 'clubcontrol-members.csv';

    // 4. Billing methods from the Members list.
    let billingById: Map<string, string> | null = null;
    try {
      billingById = await readBillingMethods(jar);
    } catch (error) {
      console.error('ClubControl billing methods not read:', error instanceof Error ? error.message : error);
    }
    return { csv, fileName: `${decodeURIComponent(fileName)} (fetched automatically)`, billingById };
  } finally {
    // 5. Log out (best effort).
    if (logoutToken) {
      await request(jar, '/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ _token: logoutToken }).toString(),
      }).catch(() => undefined);
    }
  }
}
