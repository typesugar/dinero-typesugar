// The same arithmetic with operator syntax (Stage 2's goal). `Calculator`
// stands in for DineroCalculator once Stage 2 makes it a typeclass with `@op`
// tags: the same methods, nothing added. Compile with
// `typesugar expand distribute.after.ts`: every operator becomes a
// `calculator.*` call (README.md).

/** @typeclass */
export interface Calculator<A> {
  /** @op + */ add(a: A, b: A): A;
  /** @op - */ subtract(a: A, b: A): A;
  /** @op * */ multiply(a: A, b: A): A;
  /** @op / */ integerDivide(a: A, b: A): A;
  compare(a: A, b: A): -1 | 0 | 1;
  zero(): A;
}

export function distributeArithmetic<TAmount>(
  calculator: Calculator<TAmount>,
  value: TAmount,
  ratios: readonly TAmount[],
  equalFn: (a: TAmount, b: TAmount) => boolean,
  index: number,
  shares: TAmount[],
  amount: TAmount
) {
  const zero = calculator.zero();
  const total = ratios.reduce((a, b) => a + b, zero);
  let remainder = value;
  // `/` = integerDivide. Split from `|| zero`: `typesugar check` doesn't see
  // the rewritten type through `||` (CASE-STUDY.md, F8).
  const quotient: TAmount = (value * ratios[index]) / total;
  const share = quotient || zero;
  remainder = remainder - share; // `-=` is not supported by @op
  shares[index] = shares[index] + amount;
  const newRemainder = remainder - amount;
  // `===` would need an Eq dictionary; the calculator only has compare.
  return equalFn(newRemainder, remainder);
}
