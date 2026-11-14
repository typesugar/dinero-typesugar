# Operator syntax demo (Stage 2 preview)

What operator syntax buys dinero, compiled with the vendored typesugar
(`vendor/typesugar/COMMIT`). From the repo root after `npm ci`:

    node case-study/demo/operators/run.mjs
    cd case-study/demo/operators && ../../../node_modules/.bin/typesugar check -p tsconfig.json
    ../../../node_modules/.bin/typesugar expand distribute.after.ts

The root `tsconfig.json` excludes this directory: plain `tsc` rejects
operators on objects and type parameters by design, and `typesugar check` is
the type check for these files.

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

`typesugar expand distribute.after.ts` turns every operator back into the
`calculator.*` call on the left. `distribute.after.ts` declares its own
`Calculator` typeclass (DineroCalculator's methods with `@op` tags), because
making DineroCalculator itself a typeclass is Stage 2's work. Two things stay
as calls: `===` (it would need an `Eq` dictionary; the calculator only has
`compare`, and adding a method would break custom calculators) and `-=`
(`@op` doesn't cover assignment operators).

## Generic and concrete operands

`generic-vs-concrete.ts` writes `(a + b) * k` twice against a calculator
typeclass with an instance for an object type, and `run.mjs` runs the
expanded code:

- **Concrete operand types** (`x, y: Big`): `({ v: (x.v + y.v) * x.v })`.
  Result `{"v":3}`.
- **Generic operand types** (`a, b, k: A` with `c: Calc<A>` in scope):
  the function compiles to `c.multiply(c.add(a, b), k)`, and its
  specialization for `Big` is `({ v: (a.v + b.v) * k.v })`. Result
  `{"v":3}`.

With typesugar before `c33dfa8b` the generic operators stayed native
JavaScript and the specialization returned `NaN` (CASE-STUDY.md, F7).
