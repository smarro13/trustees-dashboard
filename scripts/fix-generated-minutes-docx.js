// One-off migration: repairs the AI-formatter minutes documents saved to
// Supabase Storage that don't open as Word documents.
//
// Two generations of this bug exist under minutes/minutes-generated/:
//   1. Original: HTML content saved as "*.docx" with the real OOXML
//      content-type. Not a ZIP package at all, so every Word variant
//      rejects it as corrupt.
//   2. Interim (from an earlier run of this script): the same HTML
//      rewrapped as "Word HTML" (MSO/Word XML namespace preamble) and saved
//      as "*.doc" / application/msword. Desktop Word's legacy HTML-import
//      filter opens that, but Word Mobile, Word Online and Google Docs do
//      not — they expect a genuine OOXML structure. Hence "worked once on
//      laptop, not on mobile".
//
// This script converts both generations into a REAL .docx package (a ZIP
// with actual word/document.xml content, built with the `docx` npm
// package — the same library lib/minutesGenerator.ts now uses), which
// opens correctly everywhere. It parses the small, fully-known HTML
// vocabulary our own generator has always produced (h1-h4, p, ul>li,
// table>tr>th/td, a couple of span classes) — nothing else touches these
// objects, so that vocabulary is exhaustive.
//
// Usage (from the repo root; requires `npm install` to have pulled in the
// `docx` dependency):
//   node scripts/fix-generated-minutes-docx.js --dry-run     # preview only
//   node scripts/fix-generated-minutes-docx.js               # apply
//   node scripts/fix-generated-minutes-docx.js --delete-old  # also remove the superseded .doc/.docx objects
//
// Idempotent: an object that's already a real ZIP/docx (checked by magic
// bytes) is left alone, so re-runs just fill gaps. Requires
// SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const docx = require('docx');

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
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function looksBinaryDoc(buffer) {
  const head = buffer.slice(0, 4).toString('latin1');
  return head.startsWith('PK') || head.startsWith('%PDF') || head.startsWith('\xD0\xCF\x11\xE0');
}

function stripTags(s) {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PRIORITY_COLOR = { high: 'D32F2F', medium: 'F57C00', low: '388E3C' };

// Parses the known small HTML vocabulary our generator has always produced
// (regardless of which of the two broken generations wrapped it) into docx
// paragraph/table blocks, in document order.
function htmlToDocxChildren(html) {
  const { Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } = docx;
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const body = bodyMatch ? bodyMatch[1] : html;

  const HEADING = {
    1: HeadingLevel.HEADING_1,
    2: HeadingLevel.HEADING_2,
    3: HeadingLevel.HEADING_3,
    4: HeadingLevel.HEADING_4,
  };

  const children = [];
  const blockRe = /<h([1-4])>([\s\S]*?)<\/h\1>|<table>([\s\S]*?)<\/table>|<ul>([\s\S]*?)<\/ul>|<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = blockRe.exec(body))) {
    if (m[1]) {
      const text = stripTags(m[2]);
      if (text) children.push(new Paragraph({ text, heading: HEADING[m[1]] }));
    } else if (m[3] !== undefined) {
      const rows = [];
      const rowRe = /<tr>([\s\S]*?)<\/tr>/gi;
      let rm;
      while ((rm = rowRe.exec(m[3]))) {
        const cells = [];
        const cellRe = /<(th|td)([^>]*)>([\s\S]*?)<\/\1>/gi;
        let cm;
        while ((cm = cellRe.exec(rm[1]))) {
          const isHeader = cm[1] === 'th';
          const attrs = cm[2] || '';
          const text = stripTags(cm[3]);
          let color;
          if (/priority-high/.test(attrs)) color = PRIORITY_COLOR.high;
          else if (/priority-medium/.test(attrs)) color = PRIORITY_COLOR.medium;
          else if (/priority-low/.test(attrs)) color = PRIORITY_COLOR.low;
          cells.push(
            new TableCell({
              shading: isHeader ? { fill: 'D3D3D3' } : undefined,
              children: [new Paragraph({ children: [new TextRun({ text, bold: isHeader || !!color, color })] })],
            }),
          );
        }
        if (cells.length) rows.push(new TableRow({ tableHeader: rows.length === 0, children: cells }));
      }
      if (rows.length) children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }));
    } else if (m[4] !== undefined) {
      const liRe = /<li>([\s\S]*?)<\/li>/gi;
      let lm;
      while ((lm = liRe.exec(m[4]))) {
        const isAction = /action-flag/.test(lm[1]);
        const text = stripTags(lm[1].replace(/<span class="action-flag">[\s\S]*?<\/span>/i, ''));
        if (!text) continue;
        children.push(
          new Paragraph({
            bullet: { level: 0 },
            children: [new TextRun(text), ...(isAction ? [new TextRun({ text: '  [ACTION]', bold: true, color: 'B45309' })] : [])],
          }),
        );
      }
    } else if (m[5] !== undefined) {
      const text = stripTags(m[5]);
      if (text) children.push(new Paragraph({ text }));
    }
  }
  return children;
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

function baseName(name) {
  return name.replace(/\.docx?$/i, '');
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

  // Group objects by base name so "foo.docx" and "foo.doc" (original +
  // interim) are handled together, once each.
  const groups = new Map(); // base -> [names]
  for (const name of names) {
    const base = baseName(name);
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push(name);
  }

  const results = { fixed: 0, alreadyOk: 0, rowsRepointed: 0, orphans: 0, deleted: 0, failed: [] };

  for (const [base, variants] of groups) {
    try {
      // Download every variant so we know which (if any) is already a real
      // docx, and have HTML content to parse if not.
      const downloads = [];
      for (const name of variants) {
        const objectPath = `${STORAGE_PREFIX}/${name}`;
        const { data: blob, error: dlError } = await supabase.storage.from(STORAGE_BUCKET).download(objectPath);
        if (dlError) throw new Error(`download ${name} failed: ${dlError.message}`);
        downloads.push({ name, objectPath, buffer: Buffer.from(await blob.arrayBuffer()) });
      }

      if (downloads.some((d) => looksBinaryDoc(d.buffer))) {
        console.log(`- ${base}: already a real document, skipping`);
        results.alreadyOk += 1;
        continue;
      }

      // Prefer the original .docx's content if present (it's the earliest
      // capture); fall back to the interim .doc.
      const source = downloads.find((d) => d.name.toLowerCase().endsWith('.docx')) || downloads[0];
      const children = htmlToDocxChildren(source.buffer.toString('utf8'));
      if (children.length === 0) {
        console.log(`- ${base}: no recognisable content, skipping`);
        results.alreadyOk += 1;
        continue;
      }

      const newPath = `${STORAGE_PREFIX}/${base}.docx`;

      // Find every minutes row pointing at ANY variant of this base name.
      const orFilter = variants.map((v) => `file_url.ilike.%${STORAGE_PREFIX}/${v}`).join(',');
      const { data: rows, error: rowErr } = await supabase.from('minutes').select('id, title, file_url').or(orFilter);
      if (rowErr) throw new Error(`minutes lookup failed: ${rowErr.message}`);

      console.log(`- ${base}`);
      console.log(`  variants: ${variants.join(', ')}`);
      console.log(`  -> rebuild as ${base}.docx  (${rows && rows.length ? `${rows.length} row(s): ${rows.map((r) => r.title).join('; ')}` : 'no minutes row — orphan'})`);
      if (!rows || rows.length === 0) results.orphans += 1;

      if (dryRun) {
        results.fixed += 1;
        continue;
      }

      const doc = new docx.Document({ sections: [{ properties: {}, children }] });
      const buffer = await docx.Packer.toBuffer(doc);

      const { error: upErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(newPath, buffer, { contentType: DOCX_MIME, upsert: true });
      if (upErr) throw new Error(`upload failed: ${upErr.message}`);

      const { data: newPublic } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(newPath);

      for (const row of rows || []) {
        const { error: updErr } = await supabase.from('minutes').update({ file_url: newPublic.publicUrl }).eq('id', row.id);
        if (updErr) throw new Error(`row ${row.id} update failed: ${updErr.message}`);
        results.rowsRepointed += 1;
      }

      if (deleteOld) {
        // Never delete the object we just wrote (it may share the same
        // path as the original .docx — upsert already overwrote it).
        const toRemove = variants
          .map((v) => `${STORAGE_PREFIX}/${v}`)
          .filter((p) => p !== newPath);
        if (toRemove.length) {
          const { error: rmErr } = await supabase.storage.from(STORAGE_BUCKET).remove(toRemove);
          if (rmErr) console.warn(`  -> could not delete superseded object(s): ${rmErr.message}`);
          else results.deleted += toRemove.length;
        }
      }

      results.fixed += 1;
      console.log('  -> done');
    } catch (err) {
      console.error(`- ${base}\n  -> FAILED: ${err.message}`);
      results.failed.push({ base, error: err.message });
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Rebuilt as real .docx: ${results.fixed}`);
  console.log(`Already OK:            ${results.alreadyOk}`);
  console.log(`minutes rows moved:    ${results.rowsRepointed}`);
  console.log(`Orphan objects:        ${results.orphans}  (fixed in storage, no minutes row references them)`);
  if (deleteOld) console.log(`Superseded objects deleted: ${results.deleted}`);
  console.log(`Failed:                ${results.failed.length}`);
  for (const f of results.failed) console.log(`  - ${f.base}: ${f.error}`);
  if (!dryRun && !deleteOld && results.fixed > 0) {
    console.log('\nSuperseded .doc/.docx objects were left in place. Open a few links to confirm they now work on both desktop and mobile, then re-run with --delete-old.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
