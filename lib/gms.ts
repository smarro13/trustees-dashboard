import { nameKey } from './membership';
import type { ImportedPlayer } from './importers/membershipImportParser';

// Fetches the club's player list from RFU GMS, the same list an admin exports
// from Player Management → Player List and uploads on /operations/membership.
// Server-side only (lib/gmsSync.ts).
//
// GMS has no public API. Logging in: GMS hands over to the England Rugby
// sign-in (auth.englandrugby.com, Auth0), which takes an email and password
// and sends the browser back to GMS. This follows those same steps with the
// dashboard's own account (GMS_EMAIL / GMS_PASSWORD). The Player List page
// then loads its rows from PlayerListGridData as JSON, which is read here a
// page at a time. Only name, gender, date of birth (for each player's team
// and age), RFU ID and status are requested and kept:
// no emergency contacts, medical conditions or other personal details.

const GMS = 'https://gms.rfu.com';
const TIMEOUT_MS = 30000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 AldwiniansTrusteesDashboard/1.0';
// The club's organisation ids in GMS: the one in the club dashboard address
// (used on the login page) and the one Player Management uses.
const LOGIN_ORG_ID = process.env.GMS_LOGIN_ORGANISATION_ID || '457475';
const PLAYERS_ORG_ID = process.env.GMS_ORGANISATION_ID || '2032';
const ROWS_PER_PAGE = 200;

export class GmsError extends Error {}

// One cookie jar per site (GMS and the England Rugby sign-in).
type Jars = Map<string, Map<string, string>>;

const decodeHtml = (value: string) =>
  value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#x2F;/gi, '/').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

// Every <input name=… value=…> inside the first <form> matching `formPattern`.
function readForm(html: string, formPattern: RegExp): { action: string; fields: Record<string, string> } | null {
  const start = html.search(formPattern);
  if (start < 0) return null;
  const end = html.indexOf('</form>', start);
  const form = html.slice(start, end < 0 ? undefined : end);
  const action = decodeHtml(form.match(/action="([^"]*)"/i)?.[1] ?? '');
  const fields: Record<string, string> = {};
  for (const m of form.matchAll(/<input[^>]*>/gi)) {
    const name = m[0].match(/name="([^"]+)"/i)?.[1];
    if (name) fields[name] = decodeHtml(m[0].match(/value="([^"]*)"/i)?.[1] ?? '');
  }
  return { action, fields };
}

const antiForgeryToken = (html: string) =>
  html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/)?.[1] ??
  html.match(/value="([^"]+)"[^>]*name="__RequestVerificationToken"/)?.[1] ??
  '';

async function send(jars: Jars, url: string, init: RequestInit = {}) {
  const host = new URL(url).host;
  const jar = jars.get(host) ?? new Map<string, string>();
  jars.set(host, jar);
  const headers = new Headers(init.headers);
  headers.set('User-Agent', USER_AGENT);
  if (jar.size) headers.set('Cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '));
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new GmsError(`Couldn't reach ${host}.`);
  }
  for (const cookie of res.headers.getSetCookie()) {
    const [pair] = cookie.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) {
      const value = pair.slice(eq + 1).trim();
      if (value) jar.set(pair.slice(0, eq).trim(), value);
      else jar.delete(pair.slice(0, eq).trim());
    }
  }
  return res;
}

// Sends a request and follows redirects (as GETs), keeping each site's cookies.
async function follow(jars: Jars, url: string, init: RequestInit = {}) {
  let res = await send(jars, url, init);
  let current = url;
  for (let hops = 0; res.status >= 300 && res.status < 400 && hops < 10; hops++) {
    const location = res.headers.get('location');
    if (!location) break;
    current = new URL(location, current).toString();
    res = await send(jars, current);
  }
  return { res, url: current, html: await res.text() };
}

const form = (fields: Record<string, string>) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(fields).toString(),
});

async function logIn(jars: Jars, email: string, password: string) {
  // 1. GMS's login panel: a form that hands over to the England Rugby sign-in.
  const panel = await follow(
    jars,
    `${GMS}/GMS/Account/Login?OrganisationId=${LOGIN_ORG_ID}&ViewName=AuthenticatePartial&SSO=true`,
    { headers: { 'X-Requested-With': 'XMLHttpRequest' } },
  );
  const handover = readForm(panel.html, /<form[^>]*id="authenticationForm"/i);
  if (!handover) throw new GmsError('The GMS login page has changed (no sign-in form).');

  // 2. Over to the England Rugby sign-in page.
  const signIn = await follow(jars, new URL(handover.action, GMS).toString(), form(handover.fields));
  if (!new URL(signIn.url).pathname.startsWith('/u/login')) {
    throw new GmsError('GMS didn’t send us to the England Rugby sign-in page.');
  }
  const state = readForm(signIn.html, /<form[^>]*method="post"/i)?.fields.state ?? new URL(signIn.url).searchParams.get('state') ?? '';
  if (!state) throw new GmsError('The England Rugby sign-in page has changed (no state).');

  // 3. Email and password. Success is a redirect; a 400 is a rejected login.
  const submitted = await send(jars, signIn.url, form({ state, username: email, password, action: 'default' }));
  if (submitted.status < 300 || submitted.status >= 400) {
    const html = await submitted.text();
    if (/captcha/i.test(html) && /(data-captcha|captcha-container|ulp-captcha)/i.test(html)) {
      throw new GmsError('The England Rugby sign-in asked for a captcha, so the automatic login was refused. Upload the player list by hand this time.');
    }
    throw new GmsError('The England Rugby sign-in rejected the login. Check GMS_EMAIL and GMS_PASSWORD.');
  }
  let after = await follow(jars, new URL(submitted.headers.get('location') ?? '/', signIn.url).toString());
  if (/\/mfa|\/u\/mfa|verification/i.test(after.url)) {
    throw new GmsError('The England Rugby sign-in asked for a verification code, which an automatic login can’t give.');
  }

  // 4. The sign-in hands back to GMS with a self-submitting form (code + state).
  const callback = readForm(after.html, /<form[^>]*method="post"[^>]*>/i);
  if (callback && /signin/i.test(callback.action)) {
    after = await follow(jars, new URL(callback.action, after.url).toString(), form(callback.fields));
  }
  if (!new URL(after.url).host.includes('gms.rfu.com') || /Account\/Login/i.test(after.url)) {
    throw new GmsError('The login didn’t finish on GMS.');
  }
}

// GMS dates arrive as "/Date(ms)/", ISO or "dd/mm/yyyy"; stored as YYYY-MM-DD.
function isoDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const ms = value.match(/\/Date\((-?\d+)/);
  if (ms) return new Date(Number(ms[1])).toISOString().slice(0, 10);
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const uk = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (uk) return `${uk[3]}-${uk[2].padStart(2, '0')}-${uk[1].padStart(2, '0')}`;
  return null;
}

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);

// GMS sends list values (gender, status) as { Value: 'MALEI', ListType, Display: 'Male' }.
const listValue = (value: unknown) =>
  value && typeof value === 'object' ? text((value as { Display?: unknown }).Display) : text(value);

// Only the columns the import needs, plus GMS's default filter (leave out
// inactive and rejected registrations).
const gridColumns = () =>
  ['IndRef', 'FirstName', 'LastName', 'Gender', 'DateOfBirth', 'Status'].map((p) => ({
    DataProperty: p,
    Filter: p === 'Status' ? { DataProperty: 'Status', Comparison: 'NotIn', Value: 'PLYR_INACTI,REJECTED', IsDefault: false } : null,
    Sort: null,
    ShowFilterForUser: false,
    ShowFilter: p !== 'Status',
    FilterUpdated: false,
    DefaultComparison: p === 'Status' ? 'NotIn' : 'StartsWith',
  }));

export type GmsFetch = { players: ImportedPlayer[]; registrations: number };

export async function fetchGmsPlayers(): Promise<GmsFetch> {
  const email = process.env.GMS_EMAIL || '';
  const password = process.env.GMS_PASSWORD || '';
  if (!email || !password) throw new GmsError('GMS isn’t connected yet: set GMS_EMAIL and GMS_PASSWORD.');

  const jars: Jars = new Map();
  await logIn(jars, email, password);

  // The full Player List page (not the section the browser loads into it,
  // which has no form token): its anti-forgery token, and the club context.
  const page = await follow(jars, `${GMS}/GMS/PlayerManagement/Home/PlayerList?Id=${PLAYERS_ORG_ID}`);
  if (page.res.status !== 200) throw new GmsError(`GMS's Player List returned ${page.res.status}. Does the account have access to the club?`);
  const token = antiForgeryToken(page.html);
  if (!token) throw new GmsError('GMS’s Player List page has changed (no form token).');

  const players = new Map<string, ImportedPlayer>();
  let registrations = 0;
  for (let pageNo = 1, maxPage = 1; pageNo <= maxPage && pageNo <= 50; pageNo++) {
    const jsonData = {
      GridId: 'PlayerList',
      GridModel: 'PlayerRegistration',
      GridView: 'PlayerList',
      GroupFilterGroupId: '',
      GroupFilterBOName: '',
      GroupFilterUserId: '',
      Paging: { CurrentPage: pageNo, RowsPerPage: ROWS_PER_PAGE },
      Columns: gridColumns(),
      SelectionMode: 'include',
      SelectedIds: '',
      DisplayMode: 'table',
      GetDataOnLoad: true,
    };
    const res = await send(jars, `${GMS}/GMS/PlayerManagement/Home/PlayerListGridData`, {
      ...form({ jsonData: JSON.stringify(jsonData), __RequestVerificationToken: token }),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
    });
    if (res.status !== 200) throw new GmsError(`GMS's player data returned ${res.status}.`);
    let data: any;
    try {
      data = await res.json();
      // GMS sends the grid as a JSON string inside JSON.
      if (typeof data === 'string') data = JSON.parse(data);
    } catch {
      throw new GmsError('GMS’s player data wasn’t in the expected format.');
    }
    if (!Array.isArray(data?.RowData)) throw new GmsError('GMS’s player data has changed (no rows).');
    maxPage = Number(data.MaxPage) || 1;

    for (const row of data.RowData) {
      const first = text(row.FirstName);
      const last = text(row.LastName);
      if (!first || !last) continue;
      registrations++;
      const player: ImportedPlayer = {
        name_key: nameKey(first, last),
        rfu_id: row.IndRef != null ? String(row.IndRef) : null,
        first_name: first,
        last_name: last,
        date_of_birth: isoDate(row.DateOfBirth),
        gender: listValue(row.Gender),
        gms_status: listValue(row.Status),
      };
      // A player with more than one registration is listed once per
      // registration; they count once (as in the manual upload).
      players.set(`${player.name_key}|${player.date_of_birth ?? ''}`, player);
    }
  }

  return { players: [...players.values()], registrations };
}
