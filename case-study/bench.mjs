#!/usr/bin/env node
// A/B benchmark runner for the dinero.js case study.
//
//   node case-study/bench.mjs --a v2.0.2 --b stage-0 [--rounds 5] \
//     [--cases "number add,bigint add"] [--out case-study/results/<name>]
//
// For each ref it makes a separate git worktree under --work (default
// $TMPDIR/dinero-case-study-bench), installs it (npm ci --ignore-scripts, with
// the npm version the ref's package.json pins) and builds packages/dinero.js
// with tsdown (SHIPJS=1, so the banner carries no commit hash). Pass
// --a-dir / --b-dir instead of a ref to use a tree you have already built.
//
// Both sides run the SAME harness, case-study/bench/cases.mjs from this
// checkout, against their own packages/dinero.js/dist: the built library,
// which is what users get. No typesugar code is loaded in a bench process, so
// the Turf study's loader effect (its finding F7) can't arise.
//
// Each case runs in a fresh process, interleaved A, B, A, B, ... for N
// rounds. summary.json and summary.md give per case and side the median
// ops/sec over rounds, the spread (min-max and IQR, as % of the median) and
// the delta of the B median against A. A delta smaller than the larger
// side's min-max spread is marked as noise.
//
// Numbers are only comparable within one run: same machine, same process
// ordering, interleaved. The output records the machine, Node version, date
// and the load average at start and end.

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const harness = path.join(here, 'bench', 'cases.mjs');

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
const flag = (name) => args.includes(name);

if (flag('--help') || (!opt('--a') && !opt('--a-dir'))) {
  process.stdout.write(
    fs
      .readFileSync(fileURLToPath(import.meta.url), 'utf8')
      .split('\n')
      .filter((l) => l.startsWith('//'))
      .map((l) => l.replace(/^\/\/ ?/, ''))
      .join('\n') + '\n'
  );
  process.exit(flag('--help') ? 0 : 1);
}

const allCases = execFileSync(process.execPath, [harness, '--list'], {
  encoding: 'utf8',
})
  .trim()
  .split('\n');
const cases = opt('--cases')
  ? opt('--cases')
      .split(',')
      .map((c) => c.trim())
  : allCases;
for (const c of cases) {
  if (!allCases.includes(c)) {
    console.error(
      `error: unknown case "${c}"; known:\n  ${allCases.join('\n  ')}`
    );
    process.exit(1);
  }
}
const rounds = Number(opt('--rounds', '5'));
const work = path.resolve(
  opt('--work', path.join(os.tmpdir(), 'dinero-case-study-bench'))
);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.resolve(
  opt('--out', path.join(repo, 'case-study', 'results', `bench-${stamp}`))
);

const sh = (cmd, argv, cwd) =>
  execFileSync(cmd, argv, {
    cwd,
    stdio: ['ignore', 'pipe', 'inherit'],
    encoding: 'utf8',
  }).trim();

function run(cmd, argv, cwd, env) {
  const r = spawnSync(cmd, argv, {
    cwd,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, ...env },
  });
  if (r.status !== 0)
    throw new Error(`${cmd} ${argv.join(' ')} failed in ${cwd}`);
}

/** A tree to bench: an existing dir, or a worktree of `ref` that we install and build. */
function prepare(label, ref, dir) {
  if (dir) {
    dir = path.resolve(dir);
    return {
      label,
      ref: ref ?? null,
      dir,
      sha: sh('git', ['rev-parse', 'HEAD'], dir),
    };
  }
  const sha = sh('git', ['rev-parse', `${ref}^{commit}`], repo);
  const tree = path.join(work, `${label}-${sha.slice(0, 12)}`);
  if (!fs.existsSync(tree)) {
    fs.mkdirSync(work, { recursive: true });
    sh('git', ['worktree', 'add', '--detach', tree, sha], repo);
  }
  console.error(`[bench] ${label}: ${ref} (${sha.slice(0, 12)}) in ${tree}`);
  const pm = JSON.parse(
    fs.readFileSync(path.join(tree, 'package.json'), 'utf8')
  ).packageManager;
  const npm = pm?.startsWith('npm@') ? pm : 'npm';
  // --ignore-scripts: skip the root `prepare` (husky + a full turbo build).
  run(
    'npx',
    ['-y', npm, 'ci', '--ignore-scripts', '--no-audit', '--no-fund'],
    tree
  );
  run('npx', ['tsdown'], path.join(tree, 'packages', 'dinero.js'), {
    SHIPJS: '1',
  });
  return { label, ref, dir: tree, sha };
}

/** Run one case once against one tree's dist; returns ops/sec. */
function benchOnce(tree, name) {
  const dist = path.join(tree.dir, 'packages', 'dinero.js', 'dist');
  const r = spawnSync(process.execPath, [harness, dist, name], {
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    throw new Error(
      `bench failed: ${name} in ${tree.label}\n${r.stdout}\n${r.stderr}`
    );
  }
  return JSON.parse(r.stdout.trim().split('\n').pop()).hz;
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const quantile = (xs, q) => {
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
};

function stats(xs) {
  const med = median(xs);
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  const q1 = quantile(xs, 0.25);
  const q3 = quantile(xs, 0.75);
  return {
    n: xs.length,
    median: med,
    min,
    max,
    q1,
    q3,
    rangePct: med ? ((max - min) / med) * 100 : 0,
    iqrPct: med ? ((q3 - q1) / med) * 100 : 0,
    samples: xs,
  };
}

const machine = () => ({
  cpu: os.cpus()[0]?.model ?? 'unknown',
  cores: os.cpus().length,
  memoryGB: Math.round(os.totalmem() / 2 ** 30),
  platform: `${os.platform()} ${os.release()} ${os.arch()}`,
  node: process.version,
});

// ---------------------------------------------------------------------------

const loadStart = os.loadavg();
const started = new Date().toISOString();
const A = prepare('A', opt('--a'), opt('--a-dir'));
const B = prepare('B', opt('--b'), opt('--b-dir'));

const raw = Object.fromEntries(cases.map((c) => [c, { A: [], B: [] }]));
for (let round = 1; round <= rounds; round++) {
  console.error(`[bench] round ${round}/${rounds}`);
  for (const name of cases) {
    for (const tree of [A, B])
      raw[name][tree.label].push(benchOnce(tree, name));
  }
}
const loadEnd = os.loadavg();

const summary = cases.map((name) => {
  const a = stats(raw[name].A);
  const b = stats(raw[name].B);
  const deltaPct = ((b.median - a.median) / a.median) * 100;
  const spreadPct = Math.max(a.rangePct, b.rangePct);
  return {
    benchmark: name,
    A: a,
    B: b,
    deltaPct,
    spreadPct,
    // One round has no spread, so it cannot tell signal from noise.
    noise: rounds < 2 ? null : spreadPct > Math.abs(deltaPct),
  };
});

const report = {
  started,
  finished: new Date().toISOString(),
  machine: machine(),
  loadAverage: { start: loadStart, end: loadEnd },
  rounds,
  order: 'per round, each case A then B, one fresh process per measurement',
  harness: path.relative(repo, harness),
  A: { ref: A.ref, sha: A.sha },
  B: { ref: B.ref, sha: B.sha },
  results: summary,
};

const f0 = (x) => Math.round(x).toLocaleString('en-US');
const f1 = (x) => x.toFixed(1);
const la = (l) => l.map((x) => x.toFixed(2)).join(' ');
const md = [
  `# Bench A/B: ${A.ref ?? A.dir} vs ${B.ref ?? B.dir}`,
  '',
  `- A: \`${A.sha.slice(0, 12)}\`; B: \`${B.sha.slice(0, 12)}\``,
  `- Machine: ${report.machine.cpu}, ${report.machine.cores} cores, ${report.machine.memoryGB} GB, ${report.machine.platform}; Node ${report.machine.node}`,
  `- Date: ${started} to ${report.finished}`,
  `- Load average (1/5/15 min): start ${la(loadStart)}, end ${la(loadEnd)}`,
  `- ${rounds} rounds, interleaved A/B, one fresh process per case and side. Spread is the larger side's (max-min)/median.`,
  '',
  '| Benchmark | A median ops/s | B median ops/s | Δ % | Spread % (A / B) | IQR % (A / B) | |',
  '| --- | ---: | ---: | ---: | ---: | ---: | --- |',
  ...summary.map(
    (r) =>
      `| ${r.benchmark} | ${f0(r.A.median)} | ${f0(r.B.median)} | ${r.deltaPct >= 0 ? '+' : ''}${f1(r.deltaPct)} | ${f1(r.A.rangePct)} / ${f1(r.B.rangePct)} | ${f1(r.A.iqrPct)} / ${f1(r.B.iqrPct)} | ${r.noise ? 'noise: spread > Δ' : ''} |`
  ),
  '',
  rounds < 2
    ? 'One round: no spread, so no delta here can be told apart from noise.'
    : `${summary.filter((r) => r.noise).length} of ${summary.length} deltas are smaller than their spread.`,
  '',
].join('\n');

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, 'summary.json'),
  JSON.stringify(report, null, 2) + '\n'
);
fs.writeFileSync(path.join(outDir, 'summary.md'), md);
process.stdout.write(md);
console.error(`[bench] wrote ${outDir}/summary.{json,md}`);
