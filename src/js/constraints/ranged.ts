import { assert } from "https://deno.land/std@0.180.0/_util/asserts.ts";
import { ByteBitset } from "../bitset.ts";
import { Binding, Variable } from "../query.ts";
import { lessValue, Value, VALUE_SIZE } from "../trible.ts";
import { filterInPlace, fixedUint8Array } from "../util.ts";
import { Constraint } from "./constraint.ts";

const MIN_KEY = fixedUint8Array(VALUE_SIZE).fill(0);
const MAX_KEY = fixedUint8Array(VALUE_SIZE).fill(~0);

class RangeConstraint implements Constraint {
  variable_index: number;
  lowerBound: Value;
  upperBound: Value;

  constructor(variable_index: number, lowerBound: Value, upperBound: Value) {
    this.lowerBound = lowerBound;
    this.upperBound = upperBound;
    this.variable_index = variable_index;
  }

  variables(): ByteBitset {
    const bitset = new ByteBitset();
    bitset.set(this.variable_index);
    return bitset;
  }

  estimate(_variable_index: number, _binding: Binding): number {
    return Number.MAX_VALUE;
  }

  propose(_variable_index: number, _binding: Binding): Value[] {
    throw Error("Proposal too large.");
  }

  confirm(_variable_index: number, _binding: Binding, values: Value[]): void {
    filterInPlace(values, (value) =>
      !lessValue(value, this.lowerBound) &&
      !lessValue(this.upperBound, value)
    );
  }
}

/**
 * TODO
 * @param {Variable} variable - TODO
 * @param {Type} type - TODO
 * @param {Object} bounds - TODO
 * @returns {Constraint} TODO
 */
export function ranged<T>(
  variable: Variable<T>,
  { lower, upper }: {lower: T, upper: T},
) {
  assert(variable.schema);

  let encodedLower = MIN_KEY;
  let encodedUpper = MAX_KEY;

  if (lower !== undefined) {
    encodedLower = fixedUint8Array(VALUE_SIZE);
    variable.schema.encodeValue(lower, encodedLower);
  }
  if (upper !== undefined) {
    encodedUpper = fixedUint8Array(VALUE_SIZE);
    variable.schema.encodeValue(upper, encodedUpper);
  }
  return new RangeConstraint(variable.index, encodedLower, encodedUpper);
}
