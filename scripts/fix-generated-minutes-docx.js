// One-off migration: repairs the AI-formatter minutes documents that were
// saved to Supabase Storage as HTML but labelled ".docx" with the OOXML
// content-type. Modern Word / Office 365 / Google Docs reject those as
// corrupt ("Word found unreadable content").
//
// It rewraps each broken object as "Word HTML" (adds the MSO / Word XML
// namespace preamble + a UTF-8 BOM), re-uploads it alongside the original
// with a ".doc" extension and the "application/msword" content-type, and
// repoints the matching `minutes` table row's file_url at the new object.
// This mirrors what lib/minutesGenerator.ts now produces for fresh saves.
//
// Scope: ONLY objects under the "minutes-generated/" prefix of the
// "minutes" bucket. Legacy uploads (minutes/legacy/**) and user-uploaded
// PDFs/Word docs are never touched. Real .docx/.pdf files found under the
// prefix are detected by magic bytes and skipped.
//
// Usage (from the repo root):
//   node scripts/fix-generated-minutes-docx.js --dry-run    # preview only
//   node scripts/fix-generated-minutes-docx.js              # apply
//   node scripts/fix-generated-minutes-docx.js --delete-old # also remove the .docx objects it replaced
//
// Idempotent: an object that is already valid Word HTML (has the namespace
// preamble) or already a real binary document is skipped, so re-runs just
// fill gaps. Requires SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).

const fs = require('fs');
const path = require('path');
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

const STORAGE_BUCKET = 'minutes';
const STORAGE_PREFIX = 'minutes-generated';
const MSWORD_MIME = 'application/msword';
const WORD_NS_MARKER = 'xmlns:w="urn:schemas-microsoft-com:office:word"';

const HTML_HEAD_INJECT =
  '\n  <meta name="ProgId" content="Word.Document"/>' +
  '\n  <!--[if gte mso 9]><xml>' +
  '\n    <w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument>' +
  '\n  </xml><![endif]-->';

const HTML_OPEN_TAG =
  '<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
  'xmlns:w="urn:schemas-microsoft-com:office:word" ' +
  'xmlns="http://www.w3.org/TR/REC-html40">';

// Returns the repaired document as a string (with BOM), or null if the
// content is already valid Word HTML / not our HTML to begin with.
function rewrapWordHtml(raw) {
  let html = raw.replace(/^﻿/, '');
  const lower = html.slice(0, 2048).toLowerCase();

  if (!lower.includes('<html') && !lower.includes('<!doctype html')) {
    return null; // not HTML — leave it alone
  }
  if (html.includes(WORD_NS_MARKER)) {
    return null; // already migrated
  }

  if (/<html[^>]*>/i.test(html)) {
    html = html.replace(/<html[^>]*>/i, HTML_OPEN_TAG);
  } else {
    html = html.replace(/<!doctype html>/i, `<!DOCTYPE html>\n${HTML_OPEN_TAG}`);
  }

  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head[^>]*>/i, (m) => `${m}${HTML_HEAD_INJECT}`);
  } else {
    html = html.replace(
      new RegExp(HTML_OPEN_TAG.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
      `${HTML_OPEN_TAG}\n<head><meta charset="utf-8"/>${HTML_HEAD_INJECT}\n</head>`,
    );
  }

  return '﻿' + html;
}

function looksBinaryDoc(buffer) {
  const head = buffer.slice(0, 4).toString('latin1');
  return head.startsWith('PK') || head.startsWith('%PDF') || head.startsWith('\xD0\xCF\x11\xE0');
}

async function listAllObjects(supabase) {
  const out = [];
  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .list(STORAGE_PREFIX, { limit: pageSize, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error(`list failed: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const entry of data) {
      if (entry.id === null) continue; // sub-folder placeholder
      out.push(entry.name);
    }
    if (data.length < pageSize) break;
  }
  return out;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const deleteOld = process.argv.includes('--delete-old');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Scanning ${STORAGE_BUCKET}/${STORAGE_PREFIX}/ …\n`);

  const names = await listAllObjects(supabase);
  console.log(`Found ${names.length} object(s).\n`);

  const results = { fixed: 0, skipped: 0, rowsRepointed: 0, orphans: 0, deleted: 0, failed: [] };

  for (const name of names) {
    const objectPath = `${STORAGE_PREFIX}/${name}`;
    try {
      if (name.toLowerCase().endsWith('.doc')) {
        results.skipped += 1;
        continue;
      }

      const { data: blob, error: dlError } = await supabase.storage.from(STORAGE_BUCKET).download(objectPath);
      if (dlError) throw new Error(`download failed: ${dlError.message}`);
      const buffer = Buffer.from(await blob.arrayBuffer());

      if (looksBinaryDoc(buffer)) {
        console.log(`- ${name}\n  -> real binary document, skipping`);
        results.skipped += 1;
        continue;
      }

      const repaired = rewrapWordHtml(buffer.toString('utf8'));
      if (repaired === null) {
        console.log(`- ${name}\n  -> already valid / not generated HTML, skipping`);
        results.skipped += 1;
        continue;
      }

      const newName = name.replace(/\.docx?$/i, '') + '.doc';
      const newPath = `${STORAGE_PREFIX}/${newName}`;
      const { data: oldPublic } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(objectPath);
      const { data: newPublic } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(newPath);

      // Find the minutes row(s) pointing at the old object.
      const { data: rows, error: rowErr } = await supabase
        .from('minutes')
        .select('id, title, file_url')
        .ilike('file_url', `%${objectPath}`);
      if (rowErr) throw new Error(`minutes lookup failed: ${rowErr.message}`);

      console.log(`- ${name}`);
      console.log(`  -> rewrap as ${newName}  (${rows && rows.length ? `${rows.length} row(s): ${rows.map((r) => r.title).join('; ')}` : 'no minutes row — orphan'})`);
      if (!rows || rows.length === 0) results.orphans += 1;

      if (dryRun) {
        results.fixed += 1;
        continue;
      }

      const { error: upErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(newPath, Buffer.from(repaired, 'utf8'), { contentType: MSWORD_MIME, upsert: true });
      if (upErr) throw new Error(`upload failed: ${upErr.message}`);

      for (const row of rows || []) {
        const { error: updErr } = await supabase
          .from('minutes')
          .update({ file_url: newPublic.publicUrl })
          .eq('id', row.id);
        if (updErr) throw new Error(`row ${row.id} update failed: ${updErr.message}`);
        results.rowsRepointed += 1;
      }

      if (deleteOld) {
        const { error: rmErr } = await supabase.storage.from(STORAGE_BUCKET).remove([objectPath]);
        if (rmErr) console.warn(`  -> could not delete old object: ${rmErr.message}`);
        else results.deleted += 1;
      }

      void oldPublic;
      results.fixed += 1;
      console.log('  -> done');
    } catch (err) {
      console.error(`- ${name}\n  -> FAILED: ${err.message}`);
      results.failed.push({ name, error: err.message });
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Repaired:            ${results.fixed}`);
  console.log(`Skipped (ok/binary): ${results.skipped}`);
  console.log(`minutes rows moved:  ${results.rowsRepointed}`);
  console.log(`Orphan objects:      ${results.orphans}  (fixed in storage, no minutes row references them)`);
  if (deleteOld) console.log(`Old objects deleted: ${results.deleted}`);
  console.log(`Failed:              ${results.failed.length}`);
  for (const f of results.failed) console.log(`  - ${f.name}: ${f.error}`);
  if (!dryRun && !deleteOld && results.fixed > 0) {
    console.log('\nThe original .docx objects were left in place. Re-run with --delete-old once you have confirmed the links open.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
