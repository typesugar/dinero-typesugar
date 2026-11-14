// Excerpt of packages/dinero.js/src/core/utils/distribute.ts at v2.0.2:
// the arithmetic, as dinero writes it today.
import type { DineroCalculator } from '../../../packages/dinero.js/src/core/types';

export function distributeArithmetic<TAmount>(
  calculator: DineroCalculator<TAmount>,
  value: TAmount,
  ratios: readonly TAmount[],
  equalFn: (a: TAmount, b: TAmount) => boolean,
  index: number,
  shares: TAmount[],
  amount: TAmount
) {
  const zero = calculator.zero();
  const total = ratios.reduce((a, b) => calculator.add(a, b), zero);
  let remainder = value;
  const share =
    calculator.integerDivide(
      calculator.multiply(value, ratios[index]),
      total
    ) || zero;
  remainder = calculator.subtract(remainder, share);
  shares[index] = calculator.add(shares[index], amount);
  const newRemainder = calculator.subtract(remainder, amount);
  return equalFn(newRemainder, remainder);
}
