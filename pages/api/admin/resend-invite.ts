import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // SERVER ONLY
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: true });
  }

  const { email } = req.body;

  if (!email || typeof email !== 'string') {
    // Generic response
    return res.status(200).json({ ok: true });
  }

  // 🔍 Check email exists & active (no enumeration leakage)
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('email, is_active')
    .eq('email', email.toLowerCase())
    .single();

  if (!profile || !profile.is_active) {
    // Always return success
    return res.status(200).json({ ok: true });
  }

  // 🚀 Resend invite
  await supabaseAdmin.auth.admin.inviteUserByEmail(email);

  return res.status(200).json({ ok: true });
}
