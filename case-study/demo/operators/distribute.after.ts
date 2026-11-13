// The same arithmetic with operator syntax (Stage 2's goal). This is what
// dinero's core would read like if typesugar dispatched operators on a type
// parameter to the dictionary in scope. It does NOT compile correctly today:
// see README.md (finding F7).
import { implicit } from '@typesugar/typeclass';
import type { DineroCalculator } from '../../../packages/dinero.js/src/core/types';

export function distributeArithmetic<TAmount>(
  value: TAmount,
  ratios: readonly TAmount[],
  index: number,
  shares: TAmount[],
  amount: TAmount,
  calculator: DineroCalculator<TAmount> = implicit()
) {
  const zero = calculator.zero();
  const total = ratios.reduce((a, b) => a + b, zero);
  let remainder = value;
  const share = (value * ratios[index]) / total || zero; // `/` = integerDivide
  remainder = remainder - share; // `-=` is not supported by @op
  shares[index] = shares[index] + amount;
  const newRemainder = remainder - amount;
  return newRemainder === remainder;
}
