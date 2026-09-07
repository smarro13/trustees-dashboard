// One-off migration: pulls the "previous minutes" documents listed on
// https://www.aldwinians.co.uk/minutes into this dashboard's `minutes` table
// and Supabase Storage bucket, so they show up on /agenda/minutes,
// /public/minutes, and the AGM equivalents.
//
// Usage (from the repo root):
//   node scripts/import-legacy-minutes.js --dry-run   # preview only, no writes
//   node scripts/import-legacy-minutes.js             # actually import
//
// Safe to re-run: it skips any file that already has a `minutes` row whose
// file_url matches, so a re-run after a partial failure just fills the gaps.
//
// Requires SUPABASE_SERVICE_ROLE_KEY (bypasses RLS) — this is a trusted,
// one-off admin script, not something to expose to the browser.

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

const SOURCE_ORIGIN = 'https://www.aldwinians.co.uk';
const STORAGE_BUCKET = 'minutes';
const STORAGE_PREFIX = 'legacy';

// Manually compiled from the live page's HTML (anchor text + filename dates
// cross-checked against each other) on 2026-09-07. `day`/`month` are omitted
// where the source page gave no exact date — those get flagged as
// approximate and default to the 1st of the known month/year, or are left
// undated entirely when even the month is unknown.
const LEGACY_MINUTES = [
  // 2023
  { file: '2023_01_11-Minutes-Aldwinians-Meeting-11_01_2023-published.pdf', day: 11, month: 1, year: 2023 },
  { file: '2023_02_8-Minutes-Aldwinians-Meeting-8_02_2023-published.pdf', day: 8, month: 2, year: 2023 },
  { file: '2023_03_8-Minutes-Aldwinians-Meeting-8_03_2023-published.pdf', day: 8, month: 3, year: 2023 },
  { file: '2023_04_12-Minutes-Aldwinians-Meeting-12_04_2023-published.pdf', day: 12, month: 4, year: 2023 },
  { file: '2023_05_10-Minutes-Aldwinians-Meeting-10_05_2023-published.pdf', day: 10, month: 5, year: 2023 },
  // 2022
  { file: '2022_04_13-Minutes-Aldwinians-Meeting-13_4_2022-published.pdf', day: 13, month: 4, year: 2022 },
  { file: '2022_05_11-Minutes-Aldwinians-Meeting-11_5_2022-published.pdf', day: 11, month: 5, year: 2022 },
  { file: '2022_06_08-Minutes-Aldwinians-Meeting-08_06_2022-published.pdf', day: 8, month: 6, year: 2022 },
  { file: '2022_09_14-Minutes-Aldwinians-Meeting-14_09_2022-published.pdf', day: 14, month: 9, year: 2022 },
  { file: '2022_10_12-Minutes-Aldwinians-Meeting-12_10_2022-Published.pdf', day: 12, month: 10, year: 2022 },
  { file: '2022_11_9-Minutes-Aldwinians-Meeting-9_11_2022-published.pdf', day: 9, month: 11, year: 2022 },
  { file: '2022_12_14-Minutes-Aldwinians-Meeting-14_12_2022-published.pdf', day: 14, month: 12, year: 2022 },
  // 2021
  { file: 'Minutes-Aldwinians-Meeting-6_1_2021.pdf', day: 6, month: 1, year: 2021 },
  { file: 'Minutes-Aldwinians-Meeting-20_1_2021.pdf', day: 20, month: 1, year: 2021 },
  { file: 'Minutes-Aldwinians-Meeting-3_2_2021.pdf', day: 3, month: 2, year: 2021 },
  { file: 'Minutes-Aldwinians-Meeting-17_2_2021.pdf', day: 17, month: 2, year: 2021 },
  { file: 'Minutes-Aldwinians-Meeting-3_3_2021.pdf', day: 3, month: 3, year: 2021 },
  { file: 'Minutes-Aldwinians-Meeting-17_3_2021.pdf', day: 17, month: 3, year: 2021 },
  { file: 'Minutes-Aldwinians-Meeting-31_3_2021-ml2h.pdf', day: 31, month: 3, year: 2021 },
  { file: 'Minutes-Aldwinians-Meeting-14_4_2021.pdf', day: 14, month: 4, year: 2021 },
  { file: 'Minutes-Aldwinians-Meeting-9_6_2021-ver2.pdf', day: 9, month: 6, year: 2021 },
  { file: 'Aldwinians-RUFC-Minutes-872021.pdf', day: 8, month: 7, year: 2021 },
  { file: 'Minutes-Aldwinians-Meeting-192021.pdf', day: 1, month: 9, year: 2021 },
  { file: 'Minutes-Aldwinians-Meeting-13_10_2021.pdf', day: 13, month: 10, year: 2021 },
  { file: 'Minutes-Aldwinians-Meeting-10_11_2021.pdf', day: 10, month: 11, year: 2021 },
  { file: 'Minutes-Aldwinians-Meeting-8_12_2021-published.pdf', day: 8, month: 12, year: 2021 },
  // 2020
  { file: '29TH-April-Zoom-meeting-minutes.docx', day: 29, month: 4, year: 2020 },
  { file: 'Committee-Meeting-Minutes-060520.pdf', day: 6, month: 5, year: 2020 },
  { file: 'Minutes-27052020.pdf', day: 27, month: 5, year: 2020 },
  { file: 'Committee-meeting-4-June-20.pdf', day: 4, month: 6, year: 2020 },
  { file: 'Aldwinians-RUFC-Meeting-17-6-20.docx', day: 17, month: 6, year: 2020 },
  { file: 'Committee-meeting-150720.pdf', day: 15, month: 7, year: 2020 },
  { file: 'Committee-meeting-29072020.pdf', day: 29, month: 7, year: 2020 },
  { file: 'Committee-Meeting-minutes-12082020.pdf', day: 12, month: 8, year: 2020 },
  { file: 'Committee-meeting-minutes-26082020.pdf', day: 26, month: 8, year: 2020 },
  { file: 'Committee-minutes-17092020.pdf', day: 17, month: 9, year: 2020 },
  { file: 'Final-Committee-minutes-30092020.pdf', day: 30, month: 9, year: 2020 },
  // Source page just said "October 2020" — date below is the PDF's own CreationDate metadata.
  { file: 'General-Meeting-Minutes.pdf', day: 16, month: 10, year: 2020, label: 'Aldwinians General Meeting - 16th October 2020' },
  { file: 'Minutes-15102020.pdf', day: 15, month: 10, year: 2020 },
  { file: 'Minutes-28102020-y3jk.pdf', day: 28, month: 10, year: 2020 },
  { file: 'Minutes-Aldwinians-Trustee-Meeting-25_11_2020.pdf', day: 25, month: 11, year: 2020 },
  { file: 'Minutes-Aldwinians-Trustees-Meeting-10_12_2020.pdf', day: 10, month: 12, year: 2020 },
  { file: 'Minutes-Aldwinians-Meeting-23_12_2020.pdf', day: 23, month: 12, year: 2020 },
  // AGM
  { file: 'Agenda-and-Minutes-AGM-2023-26_5_23.docx', day: 26, month: 5, year: 2023, agm: true },
  // Source page gave only the year — date below is the PDF's own CreationDate metadata.
  { file: 'Aldwinians-AGM-2021.pdf', day: 16, month: 8, year: 2021, agm: true },
  // Source page had no date at all — date below is the DOCX's own "created" metadata.
  { file: 'AGM-Minutes.docx', day: 17, month: 5, year: 2024, agm: true },
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function ordinal(n) {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]}`;
}

function buildTitle(entry) {
  if (entry.label) return entry.label;
  const datePart = `${ordinal(entry.day)} ${MONTH_NAMES[entry.month - 1]} ${entry.year}`;
  return entry.agm
    ? `AGM - Aldwinians AGM Meeting - ${datePart}`
    : `Aldwinians Committee Meeting - ${datePart}`;
}

function guessContentType(filename) {
  if (filename.endsWith('.pdf')) return 'application/pdf';
  if (filename.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (filename.endsWith('.doc')) return 'application/msword';
  return 'application/octet-stream';
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!dryRun && (!supabaseUrl || !serviceRoleKey)) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }

  const supabaseAdmin = dryRun ? null : createClient(supabaseUrl, serviceRoleKey);

  console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Importing ${LEGACY_MINUTES.length} legacy minutes from ${SOURCE_ORIGIN}/minutes\n`);

  const results = { imported: 0, skipped: 0, failed: [] };

  for (const entry of LEGACY_MINUTES) {
    const title = buildTitle(entry);
    const storagePath = `${STORAGE_PREFIX}/${entry.file}`;
    const sourceUrl = `${SOURCE_ORIGIN}/s/${encodeURI(entry.file)}`;
    const tag = entry.approximate ? '  [approximate date — please review]' : '';

    console.log(`- ${title}${tag}`);

    if (dryRun) continue;

    try {
      // Skip if already imported (idempotent re-runs).
      const { data: existing } = await supabaseAdmin
        .from('minutes')
        .select('id')
        .ilike('file_url', `%${storagePath}`)
        .limit(1);

      if (existing && existing.length > 0) {
        console.log('  -> already imported, skipping');
        results.skipped += 1;
        continue;
      }

      const response = await fetch(sourceUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AldwiniansMinutesImport/1.0)' },
      });

      if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const { error: uploadError } = await supabaseAdmin.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, buffer, {
          contentType: guessContentType(entry.file),
          upsert: true,
        });

      if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

      const { data: publicUrlData } = supabaseAdmin.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);

      const { error: insertError } = await supabaseAdmin.from('minutes').insert({
        title,
        file_url: publicUrlData.publicUrl,
        meeting_id: null,
      });

      if (insertError) throw new Error(`DB insert failed: ${insertError.message}`);

      console.log('  -> imported');
      results.imported += 1;
    } catch (err) {
      console.error(`  -> FAILED: ${err.message}`);
      results.failed.push({ file: entry.file, error: err.message });
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Imported: ${results.imported}`);
  console.log(`Skipped (already present): ${results.skipped}`);
  console.log(`Failed: ${results.failed.length}`);
  if (results.failed.length) {
    for (const f of results.failed) console.log(`  - ${f.file}: ${f.error}`);
  }

  const approximateCount = LEGACY_MINUTES.filter((e) => e.approximate).length;
  if (approximateCount) {
    console.log(`\n${approximateCount} item(s) had no exact date on the source page and used a placeholder — edit their title in the Supabase table editor if you want the precise date.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
