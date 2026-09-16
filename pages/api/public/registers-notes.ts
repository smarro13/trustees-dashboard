import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MAX_NOTES_LENGTH = 4000;

// Un-gated on purpose: this is the shared "club notes" box above the team
// registers (pitch closures, kit reminders, etc.), same as the rest of the
// /public section — visible and editable by anyone with the page link.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('register_shared_notes')
      .select('notes, updated_at')
      .eq('id', 1)
      .maybeSingle();

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(200).json({ ok: true, notes: data?.notes || '', updatedAt: data?.updated_at || null });
  }

  if (req.method === 'POST') {
    const notes = typeof req.body?.notes === 'string' ? req.body.notes.slice(0, MAX_NOTES_LENGTH) : '';

    const { error } = await supabaseAdmin
      .from('register_shared_notes')
      .upsert({ id: 1, notes, updated_at: new Date().toISOString() });

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
