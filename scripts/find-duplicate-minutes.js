// Read-only check: downloads every file referenced in the `minutes` table and
// groups them by content hash (SHA-256), so byte-identical files uploaded
// under different titles/dates show up as duplicates. Doesn't change anything.
//
// Usage: node scripts/find-duplicate-minutes.js

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

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: rows, error } = await supabase
    .from('minutes')
    .select('id, title, file_url, created_at')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to load minutes:', error.message);
    process.exit(1);
  }

  console.log(`Checking ${rows.length} minutes for duplicate file content...\n`);

  const byHash = new Map();
  const bySize = new Map();
  const failed = [];

  for (const row of rows) {
    if (!row.file_url) continue;
    try {
      const response = await fetch(row.file_url);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const buf = Buffer.from(await response.arrayBuffer());
      const hash = crypto.createHash('sha256').update(buf).digest('hex');

      if (!byHash.has(hash)) byHash.set(hash, []);
      byHash.get(hash).push(row);

      if (!bySize.has(buf.length)) bySize.set(buf.length, []);
      bySize.get(buf.length).push(row);
    } catch (err) {
      failed.push({ row, error: err.message });
    }
  }

  const exactDuplicates = [...byHash.values()].filter((group) => group.length > 1);
  const sameSizeOnly = [...bySize.values()].filter((group) => group.length > 1);

  if (exactDuplicates.length === 0) {
    console.log('No byte-identical duplicate files found.');
  } else {
    console.log(`Found ${exactDuplicates.length} group(s) of byte-identical files:\n`);
    for (const group of exactDuplicates) {
      console.log('  Duplicate group:');
      for (const row of group) {
        console.log(`    - [${row.id}] "${row.title}" (added ${row.created_at})`);
      }
      console.log('');
    }
  }

  // Same file size but different content hash can still be worth a human glance
  // (e.g. same document re-saved with a different timestamp inside it).
  const sameSizeDifferentHash = sameSizeOnly.filter(
    (group) => !exactDuplicates.some((d) => d.length === group.length && d.every((r) => group.includes(r)))
  );
  if (sameSizeDifferentHash.length > 0) {
    console.log(`\n${sameSizeDifferentHash.length} group(s) share an identical file size but differ in content — worth a manual glance:\n`);
    for (const group of sameSizeDifferentHash) {
      console.log('  Same-size group:');
      for (const row of group) {
        console.log(`    - [${row.id}] "${row.title}"`);
      }
      console.log('');
    }
  }

  if (failed.length) {
    console.log(`\n${failed.length} file(s) could not be downloaded/checked:`);
    for (const f of failed) console.log(`  - "${f.row.title}": ${f.error}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
