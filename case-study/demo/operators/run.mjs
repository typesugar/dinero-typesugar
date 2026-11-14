#!/usr/bin/env node
// Expand generic-vs-concrete.ts with the vendored typesugar CLI, print the
// expanded lines that matter, then run the expanded code and print both
// results.
//
//   node case-study/demo/operators/run.mjs
//
// Expected with typesugar 2da17ee3: concrete {"v":3}, generic null (NaN).

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const require = createRequire(path.join(repo, 'package.json'));
const ts = require('typescript');

const expanded = execFileSync(
  path.join(repo, 'node_modules/.bin/typesugar'),
  ['expand', 'generic-vs-concrete.ts'],
  { cwd: here, encoding: 'utf8' }
);

const lines = expanded.split('\n');
const show = (re, after = 0) => {
  const i = lines.findIndex((l) => re.test(l));
  if (i !== -1) console.log(lines.slice(i, i + after + 1).join('\n'));
};
console.log('--- expanded ---');
show(/^export const concrete/);
show(/^const __typesugar___addThenScale/, 2);
show(/^export const generic/);

// The implicit() import is only a marker; drop it so the module runs alone.
const js = ts.transpileModule(expanded.replace(/^import .*$/m, ''), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const mod = { exports: {} };
new Function('module', 'exports', js)(mod, mod.exports);

console.log('--- results ---');
console.log('concrete:', JSON.stringify(mod.exports.concrete));
console.log('generic: ', JSON.stringify(mod.exports.generic));
