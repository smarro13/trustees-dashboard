import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchPayerContacts } from './thrive4Contacts';
import { TextbeeError, receivedTexts, sendText } from './textbee';
import { billingByName, findClubControl, nameKey, paysByDirectDebit, type ClubControlBilling } from './membership';

// LoveAdmin migration (temporary) — see LOVEADMIN_MIGRATION.md.
//
// "Text about moving to ClubControl": one text to each LoveAdmin payer whose
// family hasn't got an active ClubControl direct debit mandate yet, sent a
// few at a time from the club's phone (lib/textbee.ts). Who to text comes from
// the uploaded LoveAdmin report (the payers of everyone on Still on
// LoveAdmin); only their mobile and email are looked up in Thrive4
// (lib/thrive4Contacts.ts). Tables in
// supabase/policies/sms_messages.sql. Used by pages/api/private/sms-campaign.ts
// (the panel on the Still on LoveAdmin card) and pages/api/cron/sms-drip/[slot].ts.
//
// It's a service message about their own membership payment, so it's sent
// whatever Thrive4's marketing "receive SMS" setting says, but anyone who
// replies STOP isn't texted again.

export const CAMPAIGN_ID = 'clubcontrol-move';

// Per drip run, and per day (textbee's free plan allows 50 a day, sent and
// received together, so this leaves room for replies).
export const PER_RUN = 10;
export const PER_DAY = 40;

export const DEFAULT_MESSAGE =
  'Hi {first}, it’s Aldwinians RUFC. Memberships have moved from LoveAdmin to ClubControl. ' +
  'Please set up your membership direct debit for {names} in ClubControl here: [LINK]. ' +
  'Your LoveAdmin payments will then be stopped. Questions? info@aldwinians.co.uk. Reply STOP to opt out.';

export const hashPhone = (phone: string) => createHash('sha256').update(phone).digest('hex');

const listNames = (names: string[]) =>
  names.length <= 1 ? names[0] ?? 'your membership' : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

// The message for one payer: {first} is their first name, {names} who they pay for.
export const renderMessage = (message: string, payerName: string, beneficiaries: string[]) =>
  message
    .replace(/\{first\}/g, payerName.trim().split(/\s+/)[0] || 'there')
    .replace(/\{names\}/g, listNames(beneficiaries));

// ClubControl's latest fetch, by name (billing method, mandate, who pays).
async function loadClubControlBilling(admin: SupabaseClient): Promise<Map<string, ClubControlBilling>> {
  const { data: latest } = await admin
    .from('membership_imports')
    .select('id')
    .eq('kind', 'members')
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) throw new Error('There’s no ClubControl data yet. Fetch from ClubControl first.');
  const { data, error } = await admin
    .from('membership_members')
    .select('first_name, last_name, billing_method, external_id, covered_by_id, mandate_status')
    .eq('import_id', latest.id)
    .range(0, 9999);
  if (error) {
    throw new Error(/billing_method|covered_by_id|mandate_status/.test(error.message)
      ? 'Run supabase/policies/membership_billing_method.sql, then fetch from ClubControl.'
      : error.message);
  }
  return billingByName(data ?? []);
}

// Still to move: anyone they pay for has no active ClubControl mandate
// (their own or the account paying for them).
const stillToMove = (beneficiaries: string[], billing: Map<string, ClubControlBilling>) =>
  beneficiaries.some((name) => !paysByDirectDebit(findClubControl(name, billing)?.record));

export type Recipient = {
  // nameKey of the payer, so nobody is texted twice.
  payer_key: string;
  payer_name: string;
  beneficiaries: string[];
  // e.g. "07••• •••123" / "m•••@gmail.com", for the page. Never the full details.
  phone_masked: string | null;
  email_masked: string | null;
};

const maskPhone = (phone: string) => `07••• •••${phone.slice(-3)}`;
const maskEmail = (email: string) => email.replace(/^(.)[^@]*(@.*)$/, '$1•••$2');

// Payers from the latest uploaded LoveAdmin report: who paid, and for whom.
async function uploadedPayers(admin: SupabaseClient) {
  const { data: latest } = await admin
    .from('membership_imports')
    .select('id')
    .eq('kind', 'loveadmin')
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) throw new Error('There’s no LoveAdmin upload yet. Upload the LoveAdmin invoices first.');
  const { data, error } = await admin.from('membership_loveadmin').select('beneficiary, payer').eq('import_id', latest.id).range(0, 9999);
  if (error) throw new Error(error.message);
  const payers = new Map<string, { payer_key: string; payer_name: string; beneficiaries: string[] }>();
  for (const row of data ?? []) {
    const payerName = (row.payer || row.beneficiary || '').trim();
    const key = nameKey(payerName, '');
    if (!key) continue;
    const payer = payers.get(key) ?? { payer_key: key, payer_name: payerName, beneficiaries: [] };
    if (row.beneficiary && !payer.beneficiaries.includes(row.beneficiary)) payer.beneficiaries.push(row.beneficiary);
    payers.set(key, payer);
  }
  return [...payers.values()];
}

// Who would be texted now: payers on the LoveAdmin upload whose family hasn't
// moved, not already in this campaign, not opted out, with their mobile and
// email from Thrive4.
async function currentRecipients(admin: SupabaseClient): Promise<(Recipient & { phone: string | null; email: string | null })[]> {
  const [payers, billing, existing, optOuts] = await Promise.all([
    uploadedPayers(admin),
    loadClubControlBilling(admin),
    admin.from('sms_messages').select('payer_key').eq('campaign_id', CAMPAIGN_ID).range(0, 9999),
    admin.from('sms_opt_outs').select('phone_hash').range(0, 9999),
  ]);
  if (existing.error) throw new Error(/sms_messages/.test(existing.error.message) ? 'Run supabase/policies/sms_messages.sql first.' : existing.error.message);
  const already = new Set((existing.data ?? []).map((r) => r.payer_key));
  const stopped = new Set((optOuts.data ?? []).map((r) => r.phone_hash));
  const toText = payers.filter((p) => !already.has(p.payer_key) && stillToMove(p.beneficiaries, billing));
  const contacts = await fetchPayerContacts(toText.map((p) => p.payer_name));
  return toText
    .map((p) => {
      const contact = contacts.get(p.payer_key);
      const phone = contact?.mobile && !stopped.has(hashPhone(contact.mobile)) ? contact.mobile : null;
      const email = contact?.email ?? null;
      return { ...p, phone, email, phone_masked: phone ? maskPhone(phone) : null, email_masked: email ? maskEmail(email) : null };
    })
    .sort((a, b) => a.payer_name.localeCompare(b.payer_name));
}

export async function previewRecipients(admin: SupabaseClient): Promise<Recipient[]> {
  return (await currentRecipients(admin)).map(({ phone, email, ...rest }) => rest);
}

export async function saveMessage(admin: SupabaseClient, message: string, by: string) {
  const { error } = await admin.from('sms_campaigns').upsert({ id: CAMPAIGN_ID, message, updated_by: by, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error) throw new Error(error.message);
}

// Adds everyone currently to text to the queue (not sending yet).
export async function queueRecipients(admin: SupabaseClient, message: string, by: string) {
  await saveMessage(admin, message, by);
  const recipients = (await currentRecipients(admin)).filter((r) => r.phone);
  if (recipients.length === 0) return { queued: 0 };
  const { error } = await admin.from('sms_messages').upsert(
    recipients.map((r) => ({
      campaign_id: CAMPAIGN_ID,
      payer_key: r.payer_key,
      payer_name: r.payer_name,
      beneficiaries: r.beneficiaries,
      phone: r.phone,
      phone_hash: hashPhone(r.phone!),
      email: r.email,
      queued_by: by,
    })),
    { onConflict: 'campaign_id,payer_key', ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
  return { queued: recipients.length };
}

export async function setActive(admin: SupabaseClient, active: boolean, by: string) {
  const { error } = await admin.from('sms_campaigns').update({ active, updated_by: by, updated_at: new Date().toISOString() }).eq('id', CAMPAIGN_ID);
  if (error) throw new Error(error.message);
}

export async function retryFailed(admin: SupabaseClient) {
  const { error } = await admin.from('sms_messages').update({ status: 'queued', error: null }).eq('campaign_id', CAMPAIGN_ID).eq('status', 'failed').not('phone', 'is', null);
  if (error) throw new Error(error.message);
}

// "STOP" replies: the number goes on the opt-out list and anything still
// queued for it is stopped.
async function recordStops(admin: SupabaseClient) {
  const replies = await receivedTexts();
  const hashes = [...new Set(replies
    .filter((r) => /^\s*(stop|unsubscribe|opt ?out)\b/i.test(r.message))
    .map((r) => {
      const digits = r.from.replace(/[^\d+]/g, '');
      const national = digits.startsWith('+44') ? `0${digits.slice(3)}` : digits.startsWith('44') ? `0${digits.slice(2)}` : digits;
      return /^07\d{9}$/.test(national) ? hashPhone(`+44${national.slice(1)}`) : null;
    })
    .filter((h): h is string => !!h))];
  if (hashes.length === 0) return 0;
  await admin.from('sms_opt_outs').upsert(hashes.map((phone_hash) => ({ phone_hash })), { onConflict: 'phone_hash', ignoreDuplicates: true });
  await admin.from('sms_messages').update({ status: 'stopped', phone: null, email: null }).eq('campaign_id', CAMPAIGN_ID).eq('status', 'queued').in('phone_hash', hashes);
  return hashes.length;
}

const startOfTodayUtc = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
};

// One drip run: up to PER_RUN texts, within PER_DAY. Each payer is checked
// again first, and skipped if their family has moved since being queued.
export async function dripRun(admin: SupabaseClient): Promise<string> {
  const { data: campaign } = await admin.from('sms_campaigns').select('message, active').eq('id', CAMPAIGN_ID).maybeSingle();
  if (!campaign?.active) return 'not running';

  let stops = 0;
  try {
    stops = await recordStops(admin);
  } catch (e) {
    console.error('SMS STOP check failed:', e instanceof Error ? e.message : e);
  }

  const { count: sentToday } = await admin
    .from('sms_messages')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', CAMPAIGN_ID)
    .eq('status', 'sent')
    .gte('sent_at', startOfTodayUtc());
  const room = Math.min(PER_RUN, PER_DAY - (sentToday ?? 0));
  if (room <= 0) return `daily limit reached (${sentToday} sent today)`;

  const { data: batch, error } = await admin
    .from('sms_messages')
    .select('id, payer_name, beneficiaries, phone, phone_hash')
    .eq('campaign_id', CAMPAIGN_ID)
    .eq('status', 'queued')
    .order('queued_at')
    .limit(room);
  if (error) throw new Error(error.message);
  if (!batch?.length) {
    await setActive(admin, false, 'finished');
    return 'all sent; stopped';
  }

  const billing = await loadClubControlBilling(admin);
  const { data: optOuts } = await admin.from('sms_opt_outs').select('phone_hash').in('phone_hash', batch.map((b) => b.phone_hash));
  const stopped = new Set((optOuts ?? []).map((o) => o.phone_hash));

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const m of batch) {
    if (stopped.has(m.phone_hash)) {
      await admin.from('sms_messages').update({ status: 'stopped', phone: null, email: null }).eq('id', m.id);
      continue;
    }
    if (!stillToMove(m.beneficiaries ?? [], billing)) {
      await admin.from('sms_messages').update({ status: 'skipped', phone: null, email: null }).eq('id', m.id);
      skipped++;
      continue;
    }
    if (!m.phone) continue;
    try {
      const { id } = await sendText(m.phone, renderMessage(campaign.message, m.payer_name, m.beneficiaries ?? []));
      await admin.from('sms_messages').update({ status: 'sent', phone: null, email: null, sent_at: new Date().toISOString(), textbee_id: id, error: null }).eq('id', m.id);
      sent++;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Sending failed.';
      await admin.from('sms_messages').update({ status: 'failed', error: message }).eq('id', m.id);
      failed++;
      // Out of textbee allowance: stop this run, the rest stay queued.
      if (e instanceof TextbeeError && /limit/.test(message)) break;
    }
  }
  return `sent ${sent}, skipped ${skipped} (moved), failed ${failed}, STOP replies ${stops}`;
}

export async function campaignStatus(admin: SupabaseClient) {
  const [{ data: campaign }, { data: messages, error }] = await Promise.all([
    admin.from('sms_campaigns').select('message, active, updated_by, updated_at').eq('id', CAMPAIGN_ID).maybeSingle(),
    admin.from('sms_messages').select('payer_name, beneficiaries, status, error, sent_at, queued_at').eq('campaign_id', CAMPAIGN_ID).order('queued_at').range(0, 9999),
  ]);
  if (error) throw new Error(/sms_messages/.test(error.message) ? 'Run supabase/policies/sms_messages.sql first.' : error.message);
  return { campaign: campaign ?? { message: DEFAULT_MESSAGE, active: false, updated_by: null, updated_at: null }, messages: messages ?? [] };
}
