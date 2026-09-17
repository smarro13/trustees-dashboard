import crypto from 'crypto';

// Shared per-team passcode auth for /public/registers. This is deliberately
// lighter than the trustee login in lib/roles.ts: coaches/managers don't have
// dashboard accounts, so each team gets one shared passcode instead of
// individual logins. See supabase/policies/registers_schema.sql for why the
// actual gate is server-side (this file), not Postgres RLS.

const TOKEN_SECRET = process.env.REGISTERS_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours — roughly one session's worth of use
const SCRYPT_KEYLEN = 64;

if (!TOKEN_SECRET) {
  // Fails loudly at import time rather than issuing forgeable tokens.
  throw new Error('REGISTERS_TOKEN_SECRET (or SUPABASE_SERVICE_ROLE_KEY) must be set.');
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [salt, key] = stored.split(':');
  if (!salt || !key) return false;

  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  const keyBuf = Buffer.from(key, 'hex');
  if (keyBuf.length !== derived.length) return false;

  return crypto.timingSafeEqual(derived, keyBuf);
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
}

/** Issues an opaque, signed, time-limited token scoped to one team. */
export function issueTeamToken(teamSlug: string): string {
  const expires = Date.now() + TOKEN_TTL_MS;
  const payload = `${teamSlug}.${expires}`;
  return Buffer.from(`${payload}.${sign(payload)}`).toString('base64url');
}

/** Verifies a token was issued by us, hasn't expired, and matches this team. */
export function verifyTeamToken(token: unknown, teamSlug: string): boolean {
  if (typeof token !== 'string' || !token) return false;

  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts = decoded.split('.');
    if (parts.length !== 3) return false;
    const [slug, expiresStr, sig] = parts;

    if (slug !== teamSlug) return false;

    const expires = Number(expiresStr);
    if (!Number.isFinite(expires) || Date.now() > expires) return false;

    const expectedSig = sign(`${slug}.${expiresStr}`);
    const sigBuf = Buffer.from(sig, 'hex');
    const expectedBuf = Buffer.from(expectedSig, 'hex');
    if (sigBuf.length !== expectedBuf.length) return false;

    return crypto.timingSafeEqual(sigBuf, expectedBuf);
  } catch {
    return false;
  }
}
