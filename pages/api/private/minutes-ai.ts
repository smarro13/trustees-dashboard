import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

type Mode = 'generate' | 'improve';

type MinutesAiRequest = {
  mode?: Mode;
  meetingTitle?: string;
  meetingDate?: string;
  transcript?: string;
  currentDraft?: string;
  editRequest?: string;
};

type MinutesAiResponse = {
  ok: boolean;
  minutesText?: string;
  suggestions?: string[];
  sanitizedTranscript?: string;
  error?: string;
};

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const MODEL = process.env.OPENAI_MODEL || 'openai/gpt-oss-20b';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

const scrubPII = (input: string) => {
  let output = input;

  output = output.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]');
  output = output.replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, '[redacted-phone]');
  output = output.replace(/\b\d{1,4}\s+[A-Za-z0-9'.,\-\s]{2,}\b(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Close|Court|Way|Place|Pl|Postcode)\b/gi, '[redacted-address]');
  output = output.replace(/\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b/g, '[redacted-name]');

  return output;
};

const getBearerToken = (req: NextApiRequest) => {
  const authHeader = req.headers.authorization;
  return typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : '';
};

const getPrompt = (payload: Required<MinutesAiRequest>, sanitizedTranscript: string) => {
  const agenda = [
    '1. Apologies',
    '2. AGM',
    '3. Previous Minutes',
    '4. Action Tracker',
    '5. Correspondence',
    '6. Safeguarding',
    '7. Conflicts of Interest',
    '8. Treasury Report',
    '9. Trading Company Report',
    '10. Commercial & Transformation (includes Gym Updates, Solar Panels and Job Club)',
    '11. Events Planning',
    '12. Membership Report',
    '13. Rugby Report',
    '14. Any Other Business / Matters Arising',
  ].join('\n');

  const formatRules = [
    'Write formal, professional meeting minutes.',
    'Use Markdown formatting:',
    '  - # for the meeting title',
    '  - ## N. Section Name for each numbered agenda section',
    '  - ### Sub-heading for distinct sub-topics within a section',
    '  - Use --- as a horizontal rule divider between each ## section',
    '  - Use bullet points (- ) for lists of items discussed',
    'Write in formal third-person narrative: "The committee agreed...", "It was noted...", "Members discussed..."',
    'Be thorough — include key discussion points, decisions and agreed actions.',
    'For sections with no relevant content, write a brief professional placeholder (e.g. "No concerns were raised." or "The minutes of the previous meeting were approved as a true and accurate record.").',
    'Group related discussion points under ### sub-headings when a section covers multiple distinct topics.',
    'Never include names, email addresses, phone numbers or addresses.',
    'End with: --- then ### Meeting Closed then: There being no further business, the Chair thanked everyone for their attendance and contributions and closed the meeting.',
    'Return ONLY valid JSON with keys: minutesText (string), suggestions (array of strings).',
    'suggestions must be practical improvements to the minutes and must never include PII.',
  ].join(' ');

  if (payload.mode === 'improve') {
    const editContext = payload.editRequest
      ? `\n\nRequested changes:\n${payload.editRequest}`
      : '';
    return `${formatRules}\n\nMeeting Title: ${payload.meetingTitle}\nMeeting Date: ${payload.meetingDate}\n\nAgenda:\n${agenda}\n\nOriginal Transcript (PII scrubbed):\n${sanitizedTranscript}\n\nCurrent Draft:\n${payload.currentDraft}${editContext}\n\nTask:\nImprove the draft applying the requested changes. Preserve all factual content. Return the complete revised minutes.`;
  }

  return `${formatRules}\n\nMeeting Title: ${payload.meetingTitle}\nMeeting Date: ${payload.meetingDate}\n\nAgenda:\n${agenda}\n\nTranscript (PII scrubbed):\n${sanitizedTranscript}\n\nTask:\nGenerate complete formal minutes following the agenda order and format rules above.`;
};

const tryParseModelJson = (text: string): { minutesText: string; suggestions: string[] } | null => {
  const direct = (() => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  })();

  const candidate = direct || (() => {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  })();

  if (!candidate || typeof candidate !== 'object') return null;
  const minutesText = typeof (candidate as any).minutesText === 'string' ? (candidate as any).minutesText : '';
  const suggestions = Array.isArray((candidate as any).suggestions)
    ? (candidate as any).suggestions.filter((item: unknown) => typeof item === 'string')
    : [];

  if (!minutesText.trim()) return null;
  return { minutesText, suggestions };
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MinutesAiResponse>,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(token);

  if (userError || !user) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const body = (req.body || {}) as MinutesAiRequest;
  const mode: Mode = body.mode === 'improve' ? 'improve' : 'generate';
  const meetingTitle = (body.meetingTitle || 'Aldwinians Management Meeting Minutes').trim();
  const meetingDate = (body.meetingDate || '').trim();
  const transcript = (body.transcript || '').trim();
  const currentDraft = (body.currentDraft || '').trim();
  const editRequest = (body.editRequest || '').trim();

  if (!transcript) {
    return res.status(400).json({ ok: false, error: 'Transcript is required.' });
  }

  if (mode === 'improve' && !currentDraft) {
    return res.status(400).json({ ok: false, error: 'Current draft is required for improvement mode.' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ ok: false, error: 'OPENAI_API_KEY is not configured.' });
  }

  const sanitizedTranscript = scrubPII(transcript);
  const prompt = getPrompt(
    { mode, meetingTitle, meetingDate, transcript, currentDraft, editRequest },
    sanitizedTranscript,
  );

  try {
    const aiResponse = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY!}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'You format meeting minutes into strict agenda sections. Output must be JSON only with keys minutesText (string) and suggestions (array of strings).',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    const payload = await aiResponse.json();
    const content = payload?.choices?.[0]?.message?.content;

    if (!aiResponse.ok || typeof content !== 'string') {
      return res.status(500).json({ ok: false, error: payload?.error?.message || 'AI generation failed.' });
    }

    const parsed = tryParseModelJson(content);
    if (!parsed) {
      return res.status(500).json({ ok: false, error: 'AI response could not be parsed.' });
    }

    return res.status(200).json({
      ok: true,
      minutesText: parsed.minutesText,
      suggestions: parsed.suggestions,
      sanitizedTranscript,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'AI generation failed.',
    });
  }
}
