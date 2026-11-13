import { implicit } from '@typesugar/typeclass';

export type Big = { v: number };

/** @typeclass */
export interface Calc<A> {
  /** @op + */
  add(a: A, b: A): A;
  /** @op * */
  multiply(a: A, b: A): A;
}

/** @impl Calc<Big> */
export const calcBig: Calc<Big> = {
  add: (a, b) => ({ v: a.v + b.v }),
  multiply: (a, b) => ({ v: a.v * b.v }),
};

// Concrete operands: dispatches.
export const x: Big = { v: 1 };
export const y: Big = { v: 2 };
export const concrete: Big = (x + y) * x;

// Generic operands: the same expression in a generic function.
export function addThenScale<A>(a: A, b: A, k: A, c: Calc<A> = implicit()): A {
  return (a + b) * k;
}
export const generic = addThenScale(x, y, x);
