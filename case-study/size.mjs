#!/usr/bin/env node
// Hash and size every file in a dinero.js dist tree.
//
//   node case-study/size.mjs [packages/dinero.js/dist] > case-study/results/<name>.json
//   node case-study/size.mjs --compare a.json b.json
//
// The JSON lists every file with its SHA-256 and raw, gzip and brotli sizes.
// --compare prints a Markdown table of the files whose hashes differ (or that
// exist on one side only) and the size totals of each side.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const args = process.argv.slice(2);

function walk(dir, base = dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? walk(path.join(dir, e.name), base)
        : [path.relative(base, path.join(dir, e.name))]
    )
    .sort();
}

function measure(dist) {
  const files = {};
  for (const rel of walk(dist)) {
    const buf = fs.readFileSync(path.join(dist, rel));
    files[rel] = {
      sha256: crypto.createHash('sha256').update(buf).digest('hex'),
      raw: buf.length,
      gzip: zlib.gzipSync(buf, { level: 9 }).length,
      brotli: zlib.brotliCompressSync(buf, {
        params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
      }).length,
    };
  }
  return { dist: path.resolve(dist), files };
}

function totals(files, filter) {
  const t = { files: 0, raw: 0, gzip: 0, brotli: 0 };
  for (const [rel, f] of Object.entries(files)) {
    if (!filter(rel)) continue;
    t.files++;
    t.raw += f.raw;
    t.gzip += f.gzip;
    t.brotli += f.brotli;
  }
  return t;
}

if (args[0] === '--compare') {
  const [a, b] = args
    .slice(1)
    .map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
  const names = [
    ...new Set([...Object.keys(a.files), ...Object.keys(b.files)]),
  ].sort();
  const differ = names.filter((n) => a.files[n]?.sha256 !== b.files[n]?.sha256);
  const groups = {
    'all files': () => true,
    'ESM JS (dist/esm/**/*.js)': (r) =>
      r.startsWith('esm/') && r.endsWith('.js'),
    'UMD production bundles': (r) => /^umd\/.*production\.js$/.test(r),
  };
  const fmt = (t) => `${t.files} files, ${t.raw} / ${t.gzip} / ${t.brotli}`;
  const lines = [
    `| Files | A raw / gzip / brotli | B raw / gzip / brotli |`,
    `| --- | --- | --- |`,
    ...Object.entries(groups).map(
      ([label, f]) =>
        `| ${label} | ${fmt(totals(a.files, f))} | ${fmt(totals(b.files, f))} |`
    ),
    '',
    differ.length === 0
      ? `All ${names.length} files are byte-identical.`
      : `${differ.length} of ${names.length} files differ:\n\n` +
        differ
          .map(
            (n) =>
              `- \`${n}\`${!a.files[n] ? ' (B only)' : !b.files[n] ? ' (A only)' : ''}`
          )
          .join('\n'),
    '',
  ];
  process.stdout.write(lines.join('\n'));
} else {
  const dist = args[0] ?? 'packages/dinero.js/dist';
  process.stdout.write(JSON.stringify(measure(dist), null, 2) + '\n');
}
