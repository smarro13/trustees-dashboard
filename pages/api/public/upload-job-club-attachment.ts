import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

// Kept separate from the "minutes" bucket (used for official meeting records) since
// this endpoint accepts anonymous, unauthenticated uploads.
const PUBLIC_ATTACHMENTS_BUCKET = 'public-job-club-attachments';

// No HTML/SVG/script-executable types — those would come back at a public URL and
// could render inline as a stored-content risk. Matches the file picker's `accept`
// list in pages/public/job-club.tsx.
const ALLOWED_CONTENT_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

// Some browsers report an empty/generic content type for .doc files; fall back to
// the file extension in that case rather than rejecting a legitimate upload.
const EXTENSION_CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

const sanitizeFileName = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .slice(0, 120);

// Never trusts the client-declared content type directly — resolves to one of our
// own canonical, allowlisted values (or null) before it's ever stored or served.
const resolveContentType = (declared: unknown, fileName: string): string | null => {
  if (typeof declared === 'string' && ALLOWED_CONTENT_TYPES.has(declared)) return declared;

  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return EXTENSION_CONTENT_TYPES[ext] || null;
};

let bucketReady: Promise<void> | null = null;

// Lazily creates the public attachments bucket on first use so this endpoint works
// without a manual Supabase dashboard step; cached per server instance.
function ensureBucketExists(): Promise<void> {
  if (!bucketReady) {
    bucketReady = (async () => {
      const { error } = await supabaseAdmin.storage.getBucket(PUBLIC_ATTACHMENTS_BUCKET);
      if (!error) return;

      await supabaseAdmin.storage.createBucket(PUBLIC_ATTACHMENTS_BUCKET, {
        public: true,
        fileSizeLimit: MAX_ATTACHMENT_BYTES,
        allowedMimeTypes: Array.from(ALLOWED_CONTENT_TYPES),
      });
    })();
  }

  return bucketReady;
}

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

  const resolvedContentType = resolveContentType(contentType, fileName);
  if (!resolvedContentType) {
    return res.status(400).json({ ok: false, error: 'Unsupported file type. Please upload an image, PDF, Word, Excel, or text file.' });
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

  await ensureBucketExists();

  const filePath = `public-job-club/${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${safeFileName}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(PUBLIC_ATTACHMENTS_BUCKET)
    .upload(filePath, binary, {
      contentType: resolvedContentType,
      upsert: false,
      cacheControl: '3600',
    });

  if (uploadError) {
    return res.status(500).json({ ok: false, error: uploadError.message });
  }

  const { data } = supabaseAdmin.storage.from(PUBLIC_ATTACHMENTS_BUCKET).getPublicUrl(filePath);

  return res.status(200).json({ ok: true, url: data.publicUrl, fileName: safeFileName });
}
