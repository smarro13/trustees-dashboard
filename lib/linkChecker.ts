// Broken link checker for the club website. Reads the site's sitemap, crawls
// its pages, then checks every link and image on them that points to the
// club website itself (links to other websites are ignored). Run weekly by pages/api/cron/link-check.ts and on
// demand from /operations/link-checker; results are saved to link_check_runs
// (supabase/policies/link_check_runs.sql).

import type { SupabaseClient } from '@supabase/supabase-js';

export const DEFAULT_SITE_URL = 'https://www.aldwinians.co.uk/';

const MAX_PAGES = 300;
const CONCURRENCY = 8;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_FOUND_ON = 10;
const USER_AGENT = 'AldwiniansDashboardLinkChecker/1.0 (+https://dashboard.aldwinians.co.uk)';

// 'broken': the link is dead (404, 410, 5xx, no such host).
// 'blocked': the page refused an automated check (401/403/429), e.g. a
// password-protected page. Usually fine in a browser, so it's listed separately.
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

export type LinkCheckResult = {
  site_url: string;
  pages_checked: number;
  links_checked: number;
  broken_count: number;
  blocked_count: number;
  problems: LinkProblem[];
  truncated: boolean;
};

type FoundLink = { url: string; text: string; foundOn: Set<string> };

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

const fetchWithTimeout = async (url: string, method: 'GET' | 'HEAD') => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
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

// Runs `work` over `items`, `limit` at a time, until done or the deadline passes.
const runPool = async <T>(items: T[], limit: number, deadline: number, work: (item: T) => Promise<void>) => {
  let next = 0;
  let stoppedEarly = false;
  const worker = async () => {
    while (next < items.length) {
      if (Date.now() > deadline) {
        stoppedEarly = true;
        return;
      }
      const item = items[next++];
      await work(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return stoppedEarly;
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
  while (queue.length && Date.now() < deadline && pages.length < MAX_PAGES) {
    const sitemapUrl = queue.shift()!;
    if (seen.has(sitemapUrl)) continue;
    seen.add(sitemapUrl);
    try {
      const res = await fetchWithTimeout(sitemapUrl, 'GET');
      if (!res.ok) continue;
      const xml = await res.text();
      const locs = Array.from(xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi), (m) => decodeEntities(m[1]));
      // A sitemap index lists other sitemaps; a plain sitemap lists pages.
      if (/<sitemapindex/i.test(xml)) queue.push(...locs);
      else pages.push(...locs);
    } catch {
      // No sitemap: the crawl starts from the homepage instead.
    }
  }
  return pages;
};

export async function checkSiteLinks(siteUrlRaw: string, timeBudgetMs: number): Promise<LinkCheckResult> {
  const deadline = Date.now() + timeBudgetMs;
  // Leave ~40% of the time for checking the links once the pages are read.
  const crawlDeadline = Date.now() + timeBudgetMs * 0.6;
  const siteUrl = new URL(siteUrlRaw);

  const links = new Map<string, FoundLink>();
  const pageStatus = new Map<string, number | null>();
  const pageError = new Map<string, string>();
  const queued = new Set<string>();
  let queue: string[] = [];
  let truncated = false;

  const enqueue = (url: string) => {
    const u = new URL(url);
    if (!sameSite(u, siteUrl) || queued.has(url) || queued.size >= MAX_PAGES) return;
    // Squarespace files (/s/…) and images aren't pages to crawl.
    if (/\.(pdf|jpe?g|png|gif|webp|svg|docx?|xlsx?|pptx?|zip|mp4|mp3)$/i.test(u.pathname) || u.pathname.startsWith('/s/')) return;
    queued.add(url);
    queue.push(url);
  };

  const addLink = (url: string, text: string, foundOn: string) => {
    if (!sameSite(new URL(url), siteUrl)) return;
    const existing = links.get(url);
    if (existing) {
      existing.foundOn.add(foundOn);
      if (!existing.text && text) existing.text = text;
    } else {
      links.set(url, { url, text, foundOn: new Set([foundOn]) });
    }
  };

  enqueue(siteUrl.toString());
  for (const page of await readSitemap(siteUrl, crawlDeadline)) {
    const url = normalise(page, siteUrl.toString());
    if (url) enqueue(url);
  }

  // Crawl in waves: each wave's pages can add more pages to the next.
  while (queue.length) {
    const wave = queue;
    queue = [];
    const stopped = await runPool(wave, CONCURRENCY, crawlDeadline, async (pageUrl) => {
      try {
        const res = await fetchWithTimeout(pageUrl, 'GET');
        pageStatus.set(pageUrl, res.status);
        const type = res.headers.get('content-type') || '';
        if (!res.ok || !type.includes('text/html')) return;
        const finalUrl = res.url || pageUrl;
        if (!sameSite(new URL(finalUrl), siteUrl)) return;
        const html = await res.text();
        for (const { url, text } of extractLinks(html, finalUrl)) {
          addLink(url, text, pageUrl);
          enqueue(url);
        }
      } catch (err) {
        pageStatus.set(pageUrl, null);
        pageError.set(pageUrl, describeError(err));
      }
    });
    if (stopped) {
      truncated = true;
      break;
    }
  }
  if (queued.size >= MAX_PAGES) truncated = true;

  // Pages already fetched during the crawl don't need fetching again.
  const results = new Map<string, { status: number | null; error: string | null }>();
  for (const [url, status] of pageStatus) results.set(url, { status, error: pageError.get(url) ?? null });

  const toCheck = Array.from(links.keys()).filter((url) => !results.has(url));
  const checkStopped = await runPool(toCheck, CONCURRENCY, deadline, async (url) => {
    try {
      let res = await fetchWithTimeout(url, 'HEAD');
      // Plenty of sites don't answer HEAD properly; try a real GET before calling it broken.
      if (res.status >= 400) {
        res.body?.cancel().catch(() => {});
        res = await fetchWithTimeout(url, 'GET');
      }
      res.body?.cancel().catch(() => {});
      results.set(url, { status: res.status, error: null });
    } catch (err) {
      results.set(url, { status: null, error: describeError(err) });
    }
  });
  if (checkStopped) truncated = true;

  const problems: LinkProblem[] = [];
  for (const link of links.values()) {
    const result = results.get(link.url);
    if (!result) continue;
    const { status, error } = result;
    if (status !== null && status < 400) continue;
    const blocked = status === 401 || status === 403 || status === 429;
    problems.push({
      url: link.url,
      status,
      error,
      kind: blocked ? 'blocked' : 'broken',
      internal: sameSite(new URL(link.url), siteUrl),
      text: link.text,
      found_on: Array.from(link.foundOn).slice(0, MAX_FOUND_ON),
    });
  }
  problems.sort((a, b) => (a.kind === b.kind ? a.url.localeCompare(b.url) : a.kind === 'broken' ? -1 : 1));

  return {
    site_url: siteUrl.toString(),
    pages_checked: Array.from(pageStatus.values()).filter((s) => s !== null && s < 400).length,
    links_checked: results.size,
    broken_count: problems.filter((p) => p.kind === 'broken').length,
    blocked_count: problems.filter((p) => p.kind === 'blocked').length,
    problems,
    truncated,
  };
}

/** Runs a check of the club website and saves it as a link_check_runs row. */
export async function runAndSaveLinkCheck(supabaseAdmin: SupabaseClient, triggeredBy: string, timeBudgetMs: number) {
  const siteUrl = process.env.LINK_CHECK_SITE_URL || DEFAULT_SITE_URL;
  const startedAt = new Date().toISOString();
  try {
    const result = await checkSiteLinks(siteUrl, timeBudgetMs);
    const { data, error } = await supabaseAdmin
      .from('link_check_runs')
      .insert({ ...result, started_at: startedAt, finished_at: new Date().toISOString(), triggered_by: triggeredBy })
      .select('id')
      .single();
    if (error) return { error: `Checked the site but couldn't save the results: ${error.message}` };
    return { id: data.id as number, ...result };
  } catch (err) {
    return { error: describeError(err) };
  }
}
