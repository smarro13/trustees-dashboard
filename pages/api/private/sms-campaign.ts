import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import {
  DEFAULT_MESSAGE,
  campaignStatus,
  previewRecipients,
  queueRecipients,
  renderMessage,
  retryFailed,
  saveMessage,
  setActive,
} from '../../../lib/smsCampaign';
import { TextbeeError, sendText, textbeeConfigured } from '../../../lib/textbee';
import { ukMobile } from '../../../lib/thrive4Contacts';

// LoveAdmin migration (temporary) — see LOVEADMIN_MIGRATION.md.
// The "Text about moving to ClubControl" panel on /operations/membership
// (lib/smsCampaign.ts). Admins only.
//
//   GET                                          the campaign: message, running or not, every text's status
//   POST { action: 'preview' }                   who would be texted now (numbers masked)
//   POST { action: 'test', phone, message }      one test text to the given number
//   POST { action: 'save', message }             keep the message
//   POST { action: 'queue', message }            queue everyone shown in the preview
//   POST { action: 'start' | 'pause' }           the drip (pages/api/cron/sms-drip/[slot].ts)
//   POST { action: 'retry' }                     put failed texts back in the queue

export const config = { maxDuration: 60 };

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const isAdmin = (user: any) =>
  [user?.app_metadata?.role, user?.user_metadata?.role].some((r) => typeof r === 'string' && r.trim().toLowerCase() === 'admin');

const MAX_MESSAGE = 600;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  if (!isAdmin(user)) return res.status(403).json({ ok: false, error: 'Only admins can send texts.' });
  const by = user.email || user.id;

  try {
    if (req.method === 'GET') {
      return res.status(200).json({ ok: true, textbee: textbeeConfigured(), defaultMessage: DEFAULT_MESSAGE, ...(await campaignStatus(supabaseAdmin)) });
    }
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

    const action = String(req.body?.action ?? '');
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (['test', 'save', 'queue'].includes(action)) {
      if (!message) return res.status(400).json({ ok: false, error: 'Write the message first.' });
      if (message.length > MAX_MESSAGE) return res.status(400).json({ ok: false, error: `Keep the message under ${MAX_MESSAGE} characters.` });
    }

    switch (action) {
      case 'preview':
        return res.status(200).json({ ok: true, recipients: await previewRecipients(supabaseAdmin) });
      case 'test': {
        const phone = ukMobile(String(req.body?.phone ?? ''));
        if (!phone) return res.status(400).json({ ok: false, error: 'Enter a UK mobile number (07…).' });
        await sendText(phone, renderMessage(message, 'Test', ['Example Player']));
        return res.status(200).json({ ok: true });
      }
      case 'save':
        await saveMessage(supabaseAdmin, message, by);
        return res.status(200).json({ ok: true });
      case 'queue':
        if (/\[LINK\]/.test(message)) return res.status(400).json({ ok: false, error: 'Replace [LINK] with the ClubControl link first.' });
        return res.status(200).json({ ok: true, ...(await queueRecipients(supabaseAdmin, message, by)) });
      case 'start':
        if (!textbeeConfigured()) return res.status(400).json({ ok: false, error: 'textbee isn’t connected: set TEXTBEE_API_KEY in Vercel.' });
        await setActive(supabaseAdmin, true, by);
        return res.status(200).json({ ok: true });
      case 'pause':
        await setActive(supabaseAdmin, false, by);
        return res.status(200).json({ ok: true });
      case 'retry':
        await retryFailed(supabaseAdmin);
        return res.status(200).json({ ok: true });
      default:
        return res.status(400).json({ ok: false, error: 'Unknown action.' });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Something went wrong.';
    return res.status(e instanceof TextbeeError ? 502 : 500).json({ ok: false, error: message });
  }
}
