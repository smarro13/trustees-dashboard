// Sending texts through textbee (textbee.dev), which sends them from the
// club's own Android phone running the textbee app. Server-side only
// (lib/smsCampaign.ts).
//
// Needs TEXTBEE_API_KEY (and TEXTBEE_DEVICE_ID if more than one phone is
// linked). The free plan allows 50 messages a day and 300 a month, sent and
// received together, so lib/smsCampaign.ts sends a few at a time.

const API = 'https://api.textbee.dev/api/v1/gateway';
const TIMEOUT_MS = 20000;

export class TextbeeError extends Error {}

const headers = () => {
  const key = process.env.TEXTBEE_API_KEY;
  if (!key) throw new TextbeeError('TEXTBEE_API_KEY isn’t set.');
  return { 'x-api-key': key, 'Content-Type': 'application/json', Accept: 'application/json' };
};

// The phone to send from: a set device, or textbee's default.
const sendUrl = () => {
  const device = process.env.TEXTBEE_DEVICE_ID;
  return device ? `${API}/devices/${encodeURIComponent(device)}/send-sms` : `${API}/send-sms`;
};

export const textbeeConfigured = () => !!process.env.TEXTBEE_API_KEY;

// Sends one text to one number (+44…). Returns textbee's id for it, if any.
export async function sendText(to: string, message: string): Promise<{ id: string | null }> {
  let response: Response;
  try {
    response = await fetch(sendUrl(), {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ recipients: [to], message }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new TextbeeError('textbee didn’t respond.');
  }
  const body = await response.json().catch(() => null);
  if (response.status === 429) throw new TextbeeError('textbee’s message limit has been reached (50 a day / 300 a month on the free plan).');
  if (!response.ok) throw new TextbeeError(`textbee wouldn’t send it (${response.status}${body?.message ? `: ${body.message}` : ''}).`);
  const data = body?.data ?? body;
  const id = data?.smsBatchId ?? data?._id ?? data?.id ?? null;
  return { id: id ? String(id) : null };
}

export type ReceivedText = { from: string; message: string; receivedAt: string | null };

// Texts the phone has received (for "STOP" replies). Read only.
export async function receivedTexts(): Promise<ReceivedText[]> {
  let response: Response;
  try {
    response = await fetch(`${API}/messages?direction=received`, { headers: headers(), signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new TextbeeError('textbee didn’t respond.');
  }
  if (!response.ok) throw new TextbeeError(`textbee wouldn’t list received texts (${response.status}).`);
  const body = await response.json().catch(() => null);
  const list: any[] = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : Array.isArray(body?.data?.data) ? body.data.data : [];
  return list
    .map((m) => ({
      from: String(m.sender ?? m.from ?? m.phoneNumber ?? ''),
      message: String(m.message ?? m.body ?? ''),
      receivedAt: m.receivedAt ?? m.createdAt ?? null,
    }))
    .filter((m) => m.from);
}
