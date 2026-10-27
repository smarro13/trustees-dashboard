// Broken link checker for the club website. Reads the site's sitemap, crawls
// its pages, then checks every link and image on them that points to the
// club website itself (links to other websites are ignored).
//
// There's no rush, so it asks for one thing at a time with a pause between
// requests, and gives each request up to 10 seconds. A whole check takes
// longer than one serverless call, so the work is done in steps: each call
// advances a saved LinkCheckState until the time runs out, and the next call
// carries on (lib/linkCheckRun.ts saves it and starts the next step).

export const DEFAULT_SITE_URL = 'https://www.aldwinians.co.uk/';

const MAX_PAGES = 300;
// Squarespace answers 429 "Too many requests" if it's asked for too much at once.
const GAP_BETWEEN_REQUESTS_MS = 500;
const MAX_RETRIES = 3;
const MAX_RETRY_WAIT_MS = 10_000;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_FOUND_ON = 10;
const USER_AGENT = 'AldwiniansDashboardLinkChecker/1.0 (+https://dashboard.aldwinians.co.uk)';

// 'broken': the link is dead (404, 410, 5xx, no such host).
// 'blocked': the page refused an automated check (401/403, or 429 even after
// waiting and retrying), e.g. a password-protected page. Usually fine in a
// browser, so it's listed separately.
export type LinkProblemKind = 'broken' | 'blocked';

export type LinkProblem = {
  url: string;
  status: number | null;
  error: string | null;
  kind: LinkProblemKind;
  internal: boolean;
  text: string;
  found_on: string[];
};

/** Where a check has got to, saved between steps. */
export type LinkCheckState = {
  sitemap_read: boolean;
  to_crawl: string[];
  queued: string[];
  links: Record<string, { text: string; found_on: string[] }>;
  results: Record<string, { status: number | null; error: string | null }>;
};

export type LinkCheckResult = {
  site_url: string;
  pages_checked: number;
  links_checked: number;
  broken_count: number;
  blocked_count: number;
  problems: LinkProblem[];
  truncated: boolean;
};

const SKIP_SCHEMES = /^(mailto:|tel:|sms:|javascript:|data:|#)/i;

const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');

const sameSite = (a: URL, b: URL) => a.hostname.replace(/^www\./, '') === b.hostname.replace(/^www\./, '');

// Drop the #fragment so /page and /page#section count as one link.
const normalise = (raw: string, base: string): string | null => {
  const value = decodeEntities(raw.trim());
  if (!value || SKIP_SCHEMES.test(value)) return null;
  try {
    const url = new URL(value, base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Thrown when there isn't time left in this step for another request. The
// request is left undone, and the next step makes it.
class OutOfTime extends Error {}

// When the site answers 429 every request waits until this time; otherwise
// requests are spaced GAP_BETWEEN_REQUESTS_MS apart.
let pausedUntil = 0;
let lastRequestAt = 0;

// Retry-After is either seconds or an HTTP date.
const retryAfterMs = (res: Response, attempt: number) => {
  const header = res.headers.get('retry-after');
  const seconds = header ? Number(header) : NaN;
  const fromHeader = Number.isFinite(seconds) ? seconds * 1000 : header ? Date.parse(header) - Date.now() : NaN;
  const wait = Number.isFinite(fromHeader) && fromHeader > 0 ? fromHeader : 2000 * 2 ** attempt;
  return Math.min(wait, MAX_RETRY_WAIT_MS);
};

const fetchOnce = async (url: string, method: 'GET' | 'HEAD', deadline: number) => {
  // Only start a request that can have its full 10 seconds in this step.
  const wait = Math.max(pausedUntil, lastRequestAt + GAP_BETWEEN_REQUESTS_MS) - Date.now();
  if (Date.now() + Math.max(wait, 0) + REQUEST_TIMEOUT_MS > deadline) throw new OutOfTime();
  if (wait > 0) await sleep(wait);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  lastRequestAt = Date.now();
  try {
    return await fetch(url, {
      method,
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: method === 'GET' ? 'text/html,*/*' : '*/*' },
    });
  } finally {
    clearTimeout(timer);
  }
};

const politeFetch = async (url: string, method: 'GET' | 'HEAD', deadline: number) => {
  for (let attempt = 0; ; attempt++) {
    const res = await fetchOnce(url, method, deadline);
    if (res.status !== 429 || attempt >= MAX_RETRIES) return res;
    res.body?.cancel().catch(() => {});
    pausedUntil = Math.max(pausedUntil, Date.now() + retryAfterMs(res, attempt));
  }
};

const describeError = (err: unknown) => {
  if (err instanceof Error) {
    if (err.name === 'AbortError') return 'Timed out';
    const cause = (err as any).cause;
    const code = cause?.code as string | undefined;
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'Website not found';
    if (code === 'ECONNREFUSED') return 'Connection refused';
    if (code?.startsWith('CERT_') || code?.includes('SSL') || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
      return 'Security certificate problem';
    }
    return cause?.message || err.message;
  }
  return String(err);
};

const extractLinks = (html: string, pageUrl: string) => {
  const found: { url: string; text: string }[] = [];

  const anchor = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(anchor)) {
    const url = normalise(m[1] ?? m[2] ?? '', pageUrl);
    if (!url) continue;
    const text = decodeEntities(m[3].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 120);
    found.push({ url, text });
  }

  const image = /<img\b[^>]*?\b(?:data-src|src)\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/gi;
  for (const m of html.matchAll(image)) {
    const url = normalise(m[1] ?? m[2] ?? '', pageUrl);
    if (!url) continue;
    const alt = /\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(m[0]);
    found.push({ url, text: `Image${alt ? `: ${decodeEntities(alt[1] ?? alt[2] ?? '').slice(0, 100)}` : ''}` });
  }

  return found;
};

const readSitemap = async (siteUrl: URL, deadline: number): Promise<string[]> => {
  const pages: string[] = [];
  const queue = [new URL('/sitemap.xml', siteUrl).toString()];
  const seen = new Set<string>();
  while (queue.length && pages.length < MAX_PAGES) {
    const sitemapUrl = queue.shift()!;
    if (seen.has(sitemapUrl)) continue;
    seen.add(sitemapUrl);
    try {
      const res = await politeFetch(sitemapUrl, 'GET', deadline);
      if (!res.ok) continue;
      const xml = await res.text();
      const locs = Array.from(xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi), (m) => decodeEntities(m[1]));
      // A sitemap index lists other sitemaps; a plain sitemap lists pages.
      if (/<sitemapindex/i.test(xml)) queue.push(...locs);
      else pages.push(...locs);
    } catch (err) {
      if (err instanceof OutOfTime) throw err;
      // No sitemap: the crawl starts from the homepage instead.
    }
  }
  return pages;
};

export const newLinkCheckState = (siteUrlRaw: string): LinkCheckState => {
  const start = new URL(siteUrlRaw).toString();
  return { sitemap_read: false, to_crawl: [start], queued: [start], links: {}, results: {} };
};

/**
 * Carries on the check in `state` (changing it in place) until it's finished
 * or `deadline` (ms since epoch) is reached. Returns true when finished.
 */
export async function advanceLinkCheck(siteUrlRaw: string, state: LinkCheckState, deadline: number): Promise<boolean> {
  const siteUrl = new URL(siteUrlRaw);
  const queued = new Set(state.queued);

  const enqueue = (url: string) => {
    const u = new URL(url);
    if (!sameSite(u, siteUrl) || queued.has(url) || queued.size >= MAX_PAGES) return;
    // Squarespace files (/s/…) and images aren't pages to crawl.
    if (/\.(pdf|jpe?g|png|gif|webp|svg|docx?|xlsx?|pptx?|zip|mp4|mp3)$/i.test(u.pathname) || u.pathname.startsWith('/s/')) return;
    queued.add(url);
    state.queued.push(url);
    state.to_crawl.push(url);
  };

  const addLink = (url: string, text: string, foundOn: string) => {
    if (!sameSite(new URL(url), siteUrl)) return;
    const existing = state.links[url];
    if (!existing) {
      state.links[url] = { text, found_on: [foundOn] };
      return;
    }
    if (!existing.found_on.includes(foundOn) && existing.found_on.length < MAX_FOUND_ON) existing.found_on.push(foundOn);
    if (!existing.text && text) existing.text = text;
  };

  try {
    if (!state.sitemap_read) {
      for (const page of await readSitemap(siteUrl, deadline)) {
        const url = normalise(page, siteUrl.toString());
        if (url) enqueue(url);
      }
      state.sitemap_read = true;
    }

    // Read every page first, collecting the links on them…
    while (state.to_crawl.length) {
      const pageUrl = state.to_crawl[0];
      try {
        const res = await politeFetch(pageUrl, 'GET', deadline);
        state.results[pageUrl] = { status: res.status, error: null };
        const type = res.headers.get('content-type') || '';
        const finalUrl = res.url || pageUrl;
        if (res.ok && type.includes('text/html') && sameSite(new URL(finalUrl), siteUrl)) {
          const html = await res.text();
          for (const { url, text } of extractLinks(html, finalUrl)) {
            addLink(url, text, pageUrl);
            enqueue(url);
          }
        } else {
          res.body?.cancel().catch(() => {});
        }
      } catch (err) {
        if (err instanceof OutOfTime) throw err;
        state.results[pageUrl] = { status: null, error: describeError(err) };
      }
      state.to_crawl.shift();
    }

    // …then check each link that wasn't one of those pages.
    for (const url of Object.keys(state.links)) {
      if (state.results[url]) continue;
      try {
        let res = await politeFetch(url, 'HEAD', deadline);
        // Some servers don't answer HEAD properly; try a real GET before calling it broken.
        if (res.status >= 400) {
          res.body?.cancel().catch(() => {});
          res = await politeFetch(url, 'GET', deadline);
        }
        res.body?.cancel().catch(() => {});
        state.results[url] = { status: res.status, error: null };
      } catch (err) {
        if (err instanceof OutOfTime) throw err;
        state.results[url] = { status: null, error: describeError(err) };
      }
    }
    return true;
  } catch (err) {
    if (err instanceof OutOfTime) return false;
    throw err;
  }
}

/** The totals and problem list for `state` (so far, if it isn't finished). */
export function summariseLinkCheck(siteUrlRaw: string, state: LinkCheckState): LinkCheckResult {
  const siteUrl = new URL(siteUrlRaw);
  const problems: LinkProblem[] = [];
  for (const [url, link] of Object.entries(state.links)) {
    const result = state.results[url];
    if (!result) continue;
    const { status, error } = result;
    if (status !== null && status < 400) continue;
    const blocked = status === 401 || status === 403 || status === 429;
    problems.push({
      url,
      status,
      error,
      kind: blocked ? 'blocked' : 'broken',
      internal: sameSite(new URL(url), siteUrl),
      text: link.text,
      found_on: link.found_on,
    });
  }
  problems.sort((a, b) => (a.kind === b.kind ? a.url.localeCompare(b.url) : a.kind === 'broken' ? -1 : 1));

  const crawled = state.queued.filter((page) => !state.to_crawl.includes(page));
  return {
    site_url: siteUrl.toString(),
    pages_checked: crawled.filter((page) => {
      const r = state.results[page];
      return r && r.status !== null && r.status < 400;
    }).length,
    links_checked: Object.keys(state.results).length,
    broken_count: problems.filter((p) => p.kind === 'broken').length,
    blocked_count: problems.filter((p) => p.kind === 'blocked').length,
    problems,
    // The site has more pages than MAX_PAGES, so some weren't read.
    truncated: state.queued.length >= MAX_PAGES,
  };
}
