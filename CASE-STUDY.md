# dinero.js × typesugar: a case study

This fork of [dinero.js](https://github.com/dinerojs/dinero.js) (MIT, v2.0.2)
is the second proof point for [typesugar](https://typesugar.org), after
[Turf](https://github.com/typesugar/turf-typesugar). We refactor a real,
widely used TypeScript library in stages using typesugar's macros, and measure
whether "zero cost" holds. It is a one-off study, not a maintained fork; all
credit for dinero.js itself goes to its authors.

Branch: `typesugar-case-study`, from tag `v2.0.2` (`cc7df3e`). Each stage is a
branch (`stage-0`, `stage-1`, ...) stacked on the one before.

## Why dinero.js

dinero's `DineroCalculator<TAmount>` is a hand-rolled typeclass. It is a
dictionary of ten operations (`add`, `subtract`, `multiply`, `compare`,
`integerDivide`, `modulo`, `power`, `increment`, `decrement`, `zero`) with two
instances, one for `number` and one for `bigint`. Every Dinero object carries
its calculator, and the public functions read it off the object at run time
and thread it through curried factories:

```ts
// packages/dinero.js/src/api/add.ts
export function add<TAmount, TCurrency extends string>(...[augend, addend]: AddParams<TAmount, TCurrency>) {
  const { calculator } = augend;
  const addFn = safeAdd(calculator); // builds closures on every call
  return addFn(augend, addend);
}
// core/api/add.ts: unsafeAdd(calculator) → normalizeScale(calculator) → calculator.add(a, b)
// calculator/number/api/add.ts
export const add: DineroBinaryOperation<number> = (augend, addend) => augend + addend;
```

That is what typesugar's `@typeclass` / `@impl`, always-on specialisation and
`Numeric` / `Integral` / `Ord` operator dispatch claim to make free. The study
tests whether they do on real code, and what it takes when the dictionary
lives on the object rather than at the call site.

## Questions we want answered

1. With typesugar in the build and no source changes, is the output identical?
2. Can the calculator become a typeclass with specialised number and bigint
   paths, with dinero's public API (including custom calculators such as
   big.js, injected through `createDinero`) unchanged?
3. For each feature we adopt, what happens to bundle size, runtime
   performance, build time and type-check time?
4. Where does typesugar's generated code differ from what a person would write
   by hand, and why?
5. What did adopting it cost: lines changed, friction, bugs found in
   typesugar, features that didn't fit?

## Ground rules

- **dinero's public API and its tests are the spec.** Tests (`__tests__`),
  the type check (`npm run test:types`) and the size limits
  (`npm run test:size`) are not changed to make a stage pass. A stage that
  needs a test change says why, in the stage log.
- **Every stage is measured against the stage before it and against v2.0.2.**
- **typesugar bugs found here are fixed in typesugar** (failing test first) on
  a typesugar branch, and logged below with links. The fork never patches
  around a typesugar bug silently.
- **typesugar is consumed as packed tarballs** (`vendor/typesugar/*.tgz`) built
  from a recorded typesugar commit, so anyone can reproduce a stage without a
  local checkout (`vendor/typesugar/README.md`).
- **Custom calculators keep working.** `createDinero({ calculator })` is public
  API (the docs show big.js), so the dictionary path stays for third-party
  calculators. Specialisation may only add fast paths for the two built-in
  instances.

## Measurements (per stage)

| Metric | How |
| --- | --- |
| Tests | `npx vitest run` (74 files, 829 tests at v2.0.2), compared per test by name and status with the JSON reporter; `npm run test:types`; `npm run test:size` |
| Runtime | `case-study/bench.mjs`: A and B built in separate worktrees, then `case-study/bench/cases.mjs` (the same harness for both sides) runs each case against each side's built `dist/esm` in a fresh process, interleaved A/B over N rounds (default 5); median ops/sec, spread (min–max and IQR) and delta % |
| Bundle size | `case-study/size.mjs`: SHA-256 and raw / gzip / brotli of every `dist` file; totals for the ESM JS and the UMD production bundles (which `size-limit` checks) |
| Emitted code | Diff of `dist/esm` against the previous stage; every residual typesugar runtime reference is listed and explained |
| Build / test time | `tsdown` in `packages/dinero.js` (all five output configs) and `vitest run`, wall time, median of 3 |
| Adoption cost | Lines changed in source, new imports, friction notes |

Bench cases (number and bigint each): `add`, `multiply` by a scaled amount,
`allocate` by `[1, 2, 3, 4]`, `convert` USD→EUR, `toDecimal`. Inputs are fixed,
not random (the Turf study's finding F6). The benches run the built library,
so no typesugar code is loaded in a bench process and the Turf study's loader
effect (its finding F7) cannot arise. Each case gets its own process because
dinero's core functions are shared by the number and bigint builds: running
both in one process makes their call sites polymorphic, which is exactly what
specialisation would remove, so it gets its own measurement in Stage 1.

Runtime numbers come from local interleaved A/B runs on one stated machine.
Each result file records the CPU, Node version, date and the load average at
the start and end of the run, and marks every delta that is smaller than its
spread. The numbers are comparable only within one run. Readers re-run
`node case-study/bench.mjs --a <ref> --b <ref>` on their own machine rather
than comparing against ours.

## Stages (proposed; each is one branch, and one PR once the fork is public)

0. **Integration, no source changes.** typesugar in the tsdown build and in
   vitest. Expected: `dist/` byte-identical to v2.0.2, tests unchanged, bench
   unchanged.
1. **`Calculator` as a typeclass.** `/** @typeclass */` on the calculator
   interface (keeping `DineroCalculator` as the public name), `@impl` for the
   number and bigint calculators, call sites unchanged. Then the real question:
   the public functions get the dictionary from the object
   (`augend.calculator`), and the number and bigint entry points share one
   `api/` (the bigint index re-exports `../api`), so no call site sees a
   concrete instance. Options to try, in order: (a) does specialisation see
   through `createDinero({ calculator })` at the entry points at all; (b)
   per-instance entry points (`dinero.js` and `dinero.js/bigint` each getting
   a specialised `api/`), measuring the bundle-size cost of no longer sharing
   the chunk; (c) leave the generic path for custom calculators and add
   specialised fast paths only. Measure number-only, bigint-only and mixed
   processes. Open check: what tsdown's `dts` step does with a file the
   plugin changed (Turf's F5 says tsup's reads the unexpanded source).
2. **Operator syntax inside `core/`** (`+`, `-`, `*`, `<`, `===`) via `Numeric`
   / `Integral` / `Ord` / `Eq`. Check that the number build's specialised
   output has no dictionary calls and that bigint `+` and number `+` are never
   merged. dinero's tsconfig uses `moduleResolution: node10`, so this stage
   needs `@typesugar/std`'s subpaths to resolve under it (F4).
3. **`@derive(Eq, Ord)` / `Show`** for Dinero snapshots, replacing `equal` /
   `compare` helpers where the API allows.
4. **`@opaque` currency codes or units for `TCurrency`;** the type tests
   (`currency-safety.typetest.ts` on main; at v2.0.2, the `TCurrency` checks in
   the API tests) are the spec.
5. **`comptime()`** for the currency tables and `power(base, exponent)` scale
   factors.
6. **Contracts** (`requires:` for same-currency / same-scale checks), measured
   with checks on and stripped.

Stages 1–6 may be reordered or cut based on what each one teaches; the log
records why.

## Stage log

### Stage 0: integration, no source changes

**Result: byte-identical.** With typesugar in the tsdown build, all 19 files in
`packages/dinero.js/dist` (ESM JS, `.d.ts`, the four UMD bundles and their
source maps) are byte-identical to v2.0.2's
(`case-study/results/stage-0/size-v2.0.2-vs-stage-0.md`), and v2.0.2 builds
deterministically (two builds, same hashes). Under vitest the plugin
processes all 216 modules the suite loads, the 74 test files included, and
changes none; the 829 tests give the same results, compared per test by name
and status. Getting there took four typesugar fixes (F1–F4).

typesugar: branch
[`dinero-case-study-fixes`](https://github.com/typesugar/typesugar/tree/dinero-case-study-fixes)
at `2da17ee3`, which is `main` at `86bcf8c7` plus the four fixes. It is
vendored in `vendor/typesugar/`. F1, F3 and F4 go upstream as
[typesugar#103](https://github.com/typesugar/typesugar/pull/103); F2 is
already on `main` as the neverthrow study's equivalent fix (below).

What changed in the fork (no file under `packages/dinero.js/src` changed):

- `packages/dinero.js/tsdown.config.ts`: `plugins: [typesugar()]` from
  `unplugin-typesugar/rolldown` in each of the five output configs (ESM with
  `dts: true`, and four UMD bundles). One plugin instance per config.
- `vitest.config.ts`: `plugins: [typesugar()]` from `unplugin-typesugar/vite`.
  Unlike Turf, whose tests ran under tsx, dinero's tests run under vitest, so
  the Vite plugin covers them and no Node loader is needed.
- `package.json`: `typesugar` and `unplugin-typesugar` as devDependencies
  (vendored tarballs) and `overrides` for every packed `@typesugar/*` package.
  Lockfile: 57 entries added, none removed or changed (npm 11.11.0, the
  version v2.0.2 pins). pnpm's re-resolution problem in the Turf study (its
  F3) did not occur with npm, so no separate workspace package was needed.
- `case-study/`: `bench.mjs` (A/B runner), `bench/cases.mjs` (the cases),
  `size.mjs` (hashes and sizes) and `results/`. `vendor/typesugar/`: tarballs,
  `pack.sh`, `wire.mjs`.

Numbers (Apple M5 Pro, 18 cores, 64 GB, Node 22.23.2, shared and busy machine,
load average 4–12):

| | v2.0.2 | Stage 0 |
| --- | --- | --- |
| `tsdown` (5 configs), median of 3 | 0.85 s | 3.80 s |
| `vitest run`, wall | 1.3–2.1 s | 3.3 s |
| Tests | 829 / 829 pass | identical, per test |
| `test:types` | passes | passes (after F4) |
| `test:size` (UMD production, brotli) | 4.27 kB / 4.17 kB | identical |
| `dist/` (19 files) raw / gzip / brotli | 855,337 / 139,158 / 115,136 | identical |
| ESM JS (5 files) raw / gzip / brotli | 85,826 / 17,368 / 14,100 | identical |

- Build time: before F2 and F3 the Stage 0 build took 29 s. What remains
  (about 3 s) is one TypeScript Program and one transform pass over all 136
  source files per tsdown config, five times over the same sources (F5). The
  pipeline itself takes about 0.85 s per config for this project.
- Test time: one 220-file Program for the root tsconfig, plus a pass over
  every module the suite imports. Vitest reports module transform time going
  from about 4.5 s to 23–35 s (summed over workers); the wall-time cost is
  1–2 s.
- Lint (`oxlint packages/ test/`) and prettier pass on the changed files.

- Reproducibility: the bench runner built Stage 0 again in a fresh worktree,
  installing typesugar only from the committed tarballs; that `dist/` is
  byte-identical to v2.0.2's too.

Benchmarks (`case-study/results/stage-0/bench-v2.0.2-vs-stage-0`): v2.0.2
against Stage 0, 10 cases, 5 interleaved rounds, load average 3.7–4.9. All 10
deltas are smaller than their spread (median delta −0.6%, range −10.1% to
+2.9%). With byte-identical `dist/` both sides run the same code, so this run
measures the harness: the bigint cases are the noisiest (min–max spread up to
30%, `bigint add` IQR 23–27%), and single deltas under about 10% will not be
readable on this machine without more rounds or a quieter machine. The
number cases are tighter (IQR mostly under 5%).

## Findings

_typesugar bugs, gaps and design lessons, each with a link to its fix or issue.
Numbered separately from the Turf study's; "Turf F5" refers to that study._

- **F1 (gap, fixed): no `unplugin-typesugar/rolldown` entry point.** The plugin
  already handled Rolldown internally (`needsEmitJs` has a `rolldown` case and
  unplugin 2 builds the plugin), but the package published no subpath for it,
  so a tsdown config could not import it the way it imports the Vite or
  Rollup plugin. Fix: `src/rolldown.ts`, a tsup entry, the export, and docs
  (README, config and packages references). `entry-points.test.ts` now checks
  every bundler end to end (src module, tsup entry, export). Commit `02479fc3`
  on `dinero-case-study-fixes`, with a changeset; upstream in
  [typesugar#103](https://github.com/typesugar/typesugar/pull/103).
- **F2 (bug, fixed): the bundler plugin rebuilt the TypeScript Program once per
  file.** `transform` compared the bundler's code with the last code it had
  seen for that file, a map that starts empty, so every file's first transform
  called `pipeline.invalidate()`, which throws the Program away. A 136-file
  build rebuilt the Program 136 times per output config: the Stage 0 build
  took 29 s against 1.8 s without typesugar, with no file changed. Replaying
  the plugin's calls against the pipeline took 5.8 s for one config against
  0.85 s calling the pipeline directly. Fix: compare with what the pipeline
  reads for the file (the last code given, else the disk), as typesugar's
  ESLint processor already does. Build: 29 s → 12.7 s. Commit `56f43c89`, test
  first. This affects every bundler the plugin serves, so it probably
  explains part of Turf's build going from 74 s to 103 s in its Stage 0
  (not measured). The neverthrow case study, run at the same time, found the
  same bug independently on Rollup (its F3) and wrote the same fix (typesugar
  `932d6e55` on `neverthrow-case-study-fixes`), with the same behaviour.
  That one is on `main` (typesugar#87), so `56f43c89` stays on this study's
  branch only.
- **F3 (bug, fixed): generated declaration files went through the pipeline.**
  tsdown's `dts` plugin (rolldown-plugin-dts) hands the bundler a generated
  `.d.ts` module for each source file, and the plugin's default include
  (`/\.[jt]sx?$/`) matched them. None is on disk or in the Program, so each one
  invalidated the main Program (F2's path, since the code differs from the
  missing disk file) and was added to the out-of-project Program, which was
  rebuilt for each (1, 2, ... 99 files). 211 Program builds in one tsdown run.
  Declaration files hold nothing a macro could expand, so the filter now
  always skips `.d.ts`, `.d.mts` and `.d.cts`. Build: 12.7 s → 3.8 s. Commit
  `56e16666`, test first, with docs; upstream in typesugar#103.
- **F4 (gap, fixed for `unplugin-typesugar`; open for 19 packages): no types
  for subpath imports under `moduleResolution: node10`.** dinero v2.0.2's root
  tsconfig uses node10, which ignores `exports`, so `vitest.config.ts` and
  `tsdown.config.ts` failed `npm run test:types` with TS2307 on
  `unplugin-typesugar/vite` and `/rolldown`. node10 is still the default with
  `module: commonjs`. Fix: `typesVersions` mapping each bundler subpath to its
  `.d.ts`; bundler and node16 resolution still read `exports` (checked with
  `ts.resolveModuleName` under both). Commit `2da17ee3`, test first; upstream
  in typesugar#103. Still
  open: 19 other published packages have subpath exports and no
  `typesVersions`, including `typesugar` (8 subpaths), `@typesugar/std` (28,
  e.g. `@typesugar/std/syntax/numeric/ops`, which Stage 2 imports) and
  `@typesugar/fp` (8). Not fixed here because Stage 0 doesn't import them;
  Stage 2 will need `@typesugar/std`'s.
- **F5 (cost, open): one Program and one full pass per bundler config.**
  After F2 and F3, `TYPESUGAR_PROFILE` shows 5 Program builds (one per tsdown
  config, about 0.15 s each) and 608 file transforms (2.6 s in total) for a
  build that changes no file. Every config builds from the same tsconfig and
  sources, so a pipeline shared per tsconfig within a process would do this
  work once. A cheaper first step: skip the checker-backed pass for files that
  import nothing from typesugar. Not filed yet.
- **F6 (tooling): npm `overrides` keep the lockfile stable.** Adding the
  vendored tarballs to the root manifest with npm 11.11.0 only added lockfile
  entries. npm needs an override for a direct dependency to match its spec
  exactly, so `wire.mjs` writes `"$typesugar"` / `"$unplugin-typesugar"` for the
  two direct dependencies and file paths for the rest.
