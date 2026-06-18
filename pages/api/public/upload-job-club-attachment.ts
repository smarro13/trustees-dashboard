import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MINUTES_BUCKET = 'minutes';

const sanitizeFileName = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .slice(0, 120);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { fileName, contentType, base64Data, website } = req.body ?? {};

  if (website) {
    return res.status(200).json({ ok: true });
  }

  if (!fileName || typeof fileName !== 'string') {
    return res.status(400).json({ ok: false, error: 'File name is required' });
  }

  if (!base64Data || typeof base64Data !== 'string') {
    return res.status(400).json({ ok: false, error: 'File content is required' });
  }

  const safeFileName = sanitizeFileName(fileName);
  if (!safeFileName) {
    return res.status(400).json({ ok: false, error: 'File name is invalid' });
  }

  let binary: Buffer;

  try {
    binary = Buffer.from(base64Data, 'base64');
  } catch {
    return res.status(400).json({ ok: false, error: 'Invalid attachment payload' });
  }

  if (!binary.length) {
    return res.status(400).json({ ok: false, error: 'Attachment is empty' });
  }

  if (binary.length > MAX_ATTACHMENT_BYTES) {
    return res.status(400).json({ ok: false, error: 'Attachment exceeds 10 MB limit' });
  }

  const filePath = `public-job-club/${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${safeFileName}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(MINUTES_BUCKET)
    .upload(filePath, binary, {
      contentType: typeof contentType === 'string' && contentType.trim() ? contentType : 'application/octet-stream',
      upsert: false,
      cacheControl: '3600',
    });

  if (uploadError) {
    return res.status(500).json({ ok: false, error: uploadError.message });
  }

  const { data } = supabaseAdmin.storage.from(MINUTES_BUCKET).getPublicUrl(filePath);

  return res.status(200).json({ ok: true, url: data.publicUrl, fileName: safeFileName });
}
