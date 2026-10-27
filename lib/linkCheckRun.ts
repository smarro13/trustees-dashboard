// Server-only: runs the website link check (lib/linkChecker.ts) in steps,
// saving where it got to in link_check_runs (supabase/policies/link_check_runs.sql).
//
// Each step works for STEP_BUDGET_MS, saves, then calls
// /api/cron/link-check again to do the next step, until the check is
// finished. The daily cron also carries on any check left unfinished (say a
// step crashed). When a weekly check finishes with broken links, every admin
// is emailed (lib/linkCheckEmail.ts).

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_SITE_URL,
  advanceLinkCheck,
  newLinkCheckState,
  summariseLinkCheck,
  type LinkCheckState,
} from './linkChecker';
import { emailAdminsAboutBrokenLinks } from './linkCheckEmail';

export const WEEKLY_TRIGGER = 'Weekly check';

// Each step's working time; the API routes allow 60 seconds in all, leaving
// room to save and start the next step.
const STEP_BUDGET_MS = 45_000;
// A step holds the run for this long, so two steps never work on it at once.
const LOCK_MS = 75_000;
// Steps in a row before leaving the rest to the next daily cron.
export const MAX_STEPS = 60;

export type StepOutcome =
  | { error: string }
  | { idle: true }
  | { busy: true }
  | { id: number; done: boolean; email?: string };

type RunRef = { id: number; site_url: string; triggered_by: string };

/**
 * The running check, or a new one started by `startAs` if none is running
 * (or null if none is running and `startAs` isn't given).
 */
export async function findOrStartLinkCheck(
  supabaseAdmin: SupabaseClient,
  startAs?: string,
): Promise<{ error: string } | { run: RunRef | null }> {
  const { data: running, error: findError } = await supabaseAdmin
    .from('link_check_runs')
    .select('id, site_url, triggered_by')
    .eq('status', 'running')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (findError) return { error: findError.message };
  if (running || !startAs) return { run: running as RunRef | null };

  const siteUrl = process.env.LINK_CHECK_SITE_URL || DEFAULT_SITE_URL;
  const { data, error } = await supabaseAdmin
    .from('link_check_runs')
    .insert({ status: 'running', site_url: siteUrl, triggered_by: startAs, state: newLinkCheckState(siteUrl), finished_at: null })
    .select('id, site_url, triggered_by')
    .single();
  if (error) return { error: `Couldn't start a check: ${error.message}` };
  return { run: data as RunRef };
}

/**
 * Does one step of the running check, or starts a new check first if none is
 * running and `startAs` (who started it) is given.
 */
export async function runLinkCheckStep(supabaseAdmin: SupabaseClient, startAs?: string): Promise<StepOutcome> {
  const found = await findOrStartLinkCheck(supabaseAdmin, startAs);
  if ('error' in found) return found;
  const run = found.run;
  if (!run) return { idle: true };

  // Take the lock, unless another step holds it.
  const now = new Date();
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from('link_check_runs')
    .update({ locked_until: new Date(now.getTime() + LOCK_MS).toISOString() })
    .eq('id', run.id)
    .or(`locked_until.is.null,locked_until.lt.${now.toISOString()}`)
    .select('state')
    .maybeSingle();
  if (claimError) return { error: claimError.message };
  if (!claimed) return { busy: true };

  const state = claimed.state as LinkCheckState;
  let done: boolean;
  try {
    done = await advanceLinkCheck(run.site_url, state, Date.now() + STEP_BUDGET_MS);
  } catch (err) {
    await supabaseAdmin.from('link_check_runs').update({ locked_until: null }).eq('id', run.id);
    return { error: err instanceof Error ? err.message : String(err) };
  }

  const summary = summariseLinkCheck(run.site_url, state);
  const { error: saveError } = await supabaseAdmin
    .from('link_check_runs')
    .update({
      ...summary,
      status: done ? 'done' : 'running',
      state: done ? null : state,
      finished_at: done ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
      locked_until: null,
    })
    .eq('id', run.id);
  if (saveError) return { error: `Couldn't save the check: ${saveError.message}` };

  if (!done || run.triggered_by !== WEEKLY_TRIGGER) return { id: run.id, done };

  // The check is saved either way; an email problem is only reported.
  try {
    const e = await emailAdminsAboutBrokenLinks(supabaseAdmin, summary);
    return { id: run.id, done, email: e.skipped ? `not sent: ${e.skipped}` : `sent to ${e.sent.length} admin(s)` };
  } catch (err) {
    return { id: run.id, done, email: `failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Starts the next step as its own call to /api/cron/link-check. Only waits
 * long enough for the request to go out; the step runs on without this call.
 */
export async function startNextStep(baseUrl: string, step: number) {
  const secret = process.env.CRON_SECRET;
  if (!secret || step > MAX_STEPS) return;
  await fetch(`${baseUrl}/api/cron/link-check?step=${step}`, {
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(2000),
  }).catch(() => {});
}

/**
 * The dashboard's own address for the next step. On Vercel this comes from
 * its system variables, not the request, so CRON_SECRET only ever goes to the
 * dashboard itself; the Host header is only used when running locally.
 */
export const baseUrlOf = (host: string | undefined) => {
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercelHost) return `https://${vercelHost}`;
  return `http://${host || 'localhost:3000'}`;
};
