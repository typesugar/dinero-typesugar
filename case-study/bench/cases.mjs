#!/usr/bin/env node
// Benchmark cases for the dinero.js case study, run against a BUILT dinero.js
// (packages/dinero.js/dist), which is what users get. One case per process:
//
//   node case-study/bench/cases.mjs <dist dir> <case> [--ms 50] [--samples 15]
//   node case-study/bench/cases.mjs --list
//
// Prints one JSON line: { case, hz, iqrPct, samples, batch }. hz is the median
// ops/sec over the samples; each sample is one timed batch of `batch` calls,
// sized to take about --ms milliseconds.
//
// Each case runs in a fresh process so that cases can't affect each other's
// JIT state. That matters here: dinero's core functions take the calculator
// as an argument and are shared by the number and bigint builds, so running
// both in one process makes their call sites polymorphic. Inputs are fixed
// (no randomness), so every run measures the same work.

import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CASES = {
  'number add': (n) => {
    const a = n.dinero({ amount: 12345, currency: n.USD });
    const b = n.dinero({ amount: 678, currency: n.USD });
    return () => n.add(a, b);
  },
  'number multiply (scaled)': (n) => {
    const a = n.dinero({ amount: 12345, currency: n.USD });
    const by = { amount: 2001, scale: 3 };
    return () => n.multiply(a, by);
  },
  'number allocate [1,2,3,4]': (n) => {
    const a = n.dinero({ amount: 100003, currency: n.USD });
    const ratios = [1, 2, 3, 4];
    return () => n.allocate(a, ratios);
  },
  'number convert USD->EUR': (n) => {
    const a = n.dinero({ amount: 12345, currency: n.USD });
    const rates = { EUR: { amount: 89, scale: 2 } };
    return () => n.convert(a, n.EUR, rates);
  },
  'number toDecimal': (n) => {
    const a = n.dinero({ amount: 1234567, currency: n.USD });
    return () => n.toDecimal(a);
  },
  'bigint add': (b) => {
    const x = b.dinero({ amount: 12345n, currency: b.USD });
    const y = b.dinero({ amount: 678n, currency: b.USD });
    return () => b.add(x, y);
  },
  'bigint multiply (scaled)': (b) => {
    const x = b.dinero({ amount: 12345n, currency: b.USD });
    const by = { amount: 2001n, scale: 3n };
    return () => b.multiply(x, by);
  },
  'bigint allocate [1,2,3,4]': (b) => {
    const x = b.dinero({ amount: 100003n, currency: b.USD });
    const ratios = [1n, 2n, 3n, 4n];
    return () => b.allocate(x, ratios);
  },
  'bigint convert USD->EUR': (b) => {
    const x = b.dinero({ amount: 12345n, currency: b.USD });
    const rates = { EUR: { amount: 89n, scale: 2n } };
    return () => b.convert(x, b.EUR, rates);
  },
  'bigint toDecimal': (b) => {
    const x = b.dinero({ amount: 1234567n, currency: b.USD });
    return () => b.toDecimal(x);
  },
};

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : Number(args[i + 1]);
};

if (args[0] === '--list') {
  process.stdout.write(Object.keys(CASES).join('\n') + '\n');
  process.exit(0);
}

const [distDir, caseName] = args;
if (!distDir || !CASES[caseName]) {
  console.error(
    `usage: cases.mjs <dist dir> <case>\ncases:\n  ${Object.keys(CASES).join('\n  ')}`
  );
  process.exit(1);
}

const entry = caseName.startsWith('bigint')
  ? 'esm/bigint/index.js'
  : 'esm/index.js';
const lib = await import(pathToFileURL(path.resolve(distDir, entry)).href);
const fn = CASES[caseName](lib);

const targetMs = opt('--ms', 50);
const samples = opt('--samples', 15);

// Results go into a sink the optimiser can't see through.
let sink;
const time = (iterations) => {
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) sink = fn();
  return Number(process.hrtime.bigint() - t0) / 1e6;
};

// Warm up for about 500 ms, growing the batch until it takes targetMs.
let batch = 1;
const warmUntil = Date.now() + 500;
while (Date.now() < warmUntil || time(batch) < targetMs) {
  if (time(batch) < targetMs) batch *= 2;
}

const hz = [];
for (let s = 0; s < samples; s++) hz.push((batch / time(batch)) * 1000);
hz.sort((a, b) => a - b);
const q = (p) => {
  const pos = (hz.length - 1) * p;
  const lo = Math.floor(pos);
  return hz[lo] + (hz[Math.ceil(pos)] - hz[lo]) * (pos - lo);
};
const median = q(0.5);
if (sink === undefined) throw new Error('sink never written');

process.stdout.write(
  JSON.stringify({
    case: caseName,
    hz: median,
    iqrPct: ((q(0.75) - q(0.25)) / median) * 100,
    samples,
    batch,
  }) + '\n'
);
