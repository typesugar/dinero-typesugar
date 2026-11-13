# Operator syntax demo (Stage 2 preview)

What operator syntax would buy dinero, and what typesugar compiles today.
Run from the repo root after `npm ci`:

    node case-study/demo/operators/run.mjs

## The syntax win

dinero's arithmetic goes through its calculator dictionary. In `src/core` and
`src/api` (tests excluded) there are 45 calls to `add`, `subtract`,
`multiply`, `integerDivide`, `modulo`, `power` and `compare` in 24 files, plus
54 calls to the comparison helpers (`equalFn(a, b)`, `lessThanFn(a, b)`, ...).
`distribute.before.ts` is an excerpt of `core/utils/distribute.ts` as written
today; `distribute.after.ts` is the same arithmetic with operators:

| Today | With operators |
| --- | --- |
| `ratios.reduce((a, b) => calculator.add(a, b), zero)` | `ratios.reduce((a, b) => a + b, zero)` |
| `calculator.integerDivide(calculator.multiply(value, ratio), total)` | `(value * ratio) / total` |
| `remainder = calculator.subtract(remainder, share)` | `remainder = remainder - share` |
| `shares[i] = calculator.add(shares[i], amount)` | `shares[i] = shares[i] + amount` |
| `equalFn(newRemainder, remainder)` | `newRemainder === remainder` |

## What compiles today

`generic-vs-concrete.ts` defines a calculator typeclass with `@op` tags and
an instance for an object type, then writes `(a + b) * k` twice:

- **Concrete operand types: works, fully inlined.**
  `(x + y) * x` with `x, y: Big` compiles to `({ v: (x.v + y.v) * x.v })`.
  Result `{"v":3}`.
- **Generic operand types: not rewritten.** In
  `function addThenScale<A>(a: A, b: A, k: A, c: Calc<A> = implicit())`, the
  operators stay native JavaScript. Specialisation then substitutes
  `A = Big` and inlines the body unchanged, so `addThenScale(x, y, x)` runs
  `({...} + {...}) * {...}` and returns `NaN`. `typesugar check` reports
  TS2365 / TS2363 on the generic body, but the bundler plugin does not type
  check, so a tsdown build emits it without an error (CASE-STUDY.md, F7).

dinero's `core/` is generic over `TAmount` throughout, and `number` and
`bigint` operands are primitives, which operators never dispatch on. So until
typesugar dispatches an operator on a type parameter to the dictionary in
scope (here, `calculator`), the table above is a sketch, not something
Stage 2 can ship.
