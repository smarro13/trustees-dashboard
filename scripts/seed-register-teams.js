// One-off setup: creates the 12 team-register rows (Seniors open, every
// Mini & Junior age group protected by a default passcode) after you've run
// supabase/policies/registers_schema.sql. Safe to re-run — it skips any team
// slug that already exists, so it never overwrites a passcode someone has
// already changed.
//
// Usage: node scripts/seed-register-teams.js

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvLocal();

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

// Default passcodes — tell each coach/manager theirs, then have them change
// it from the unlocked register page (Manage this team's password). These
// are deliberately not secret-grade; see the header comment in
// pages/public/registers.tsx for what this protection is and isn't for.
const TEAMS = [
  { slug: 'seniors', name: 'Seniors', protected: false },
  { slug: 'minis-u3-u6', name: 'Minis (U3–U6)', protected: true, password: 'minis2026' },
  { slug: 'u8-u12s', name: 'U8–U12s', protected: true, password: 'u8u12s2026' },
  { slug: 'u13s', name: 'U13s', protected: true, password: 'u13s2026' },
  { slug: 'u12s-girls', name: 'U12s Girls', protected: true, password: 'u12sgirls2026' },
  { slug: 'u14s', name: 'U14s', protected: true, password: 'u14s2026' },
  { slug: 'u14s-girls', name: 'U14s Girls', protected: true, password: 'u14sgirls2026' },
  { slug: 'u15s', name: 'U15s', protected: true, password: 'u15s2026' },
  { slug: 'u16s', name: 'U16s', protected: true, password: 'u16s2026' },
  { slug: 'u16s-girls', name: 'U16s Girls', protected: true, password: 'u16sgirls2026' },
  { slug: 'u17s', name: 'U17s', protected: true, password: 'u17s2026' },
  { slug: 'u18s', name: 'U18s', protected: true, password: 'u18s2026' },
];

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: existingRows, error: existingError } = await supabase
    .from('register_teams')
    .select('slug');
  if (existingError) {
    console.error('Failed to check existing teams:', existingError.message);
    process.exit(1);
  }
  const existingSlugs = new Set((existingRows || []).map((r) => r.slug));

  const toInsert = TEAMS.filter((t) => !existingSlugs.has(t.slug)).map((t, i) => ({
    slug: t.slug,
    name: t.name,
    is_protected: t.protected,
    password_hash: t.protected ? hashPassword(t.password) : null,
    sort_order: i,
  }));

  if (toInsert.length === 0) {
    console.log('All team rows already exist — nothing to do.');
    return;
  }

  const { error: insertError } = await supabase.from('register_teams').insert(toInsert);
  if (insertError) {
    console.error('Failed to insert teams:', insertError.message);
    process.exit(1);
  }

  console.log(`Created ${toInsert.length} team row(s).\n`);
  console.log('Default passcodes to share with each coach/manager:\n');
  for (const t of TEAMS) {
    if (t.protected && !existingSlugs.has(t.slug)) {
      console.log(`  ${t.name.padEnd(16)} ${t.password}`);
    }
  }
  console.log('\nTell each coach to change theirs from the unlocked register page as soon as they can.');
}

main();
