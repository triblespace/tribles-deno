import { ByteBitset } from "../bitset.ts";
import { Binding } from "../query.ts";
import { Value } from "../trible.ts";

export interface Constraint {
  variables(): ByteBitset;
  estimate(variable_index: number, binding: Binding): number;
  propose(variable_index: number, binding: Binding): Value[];
  confirm(variable_index: number, binding: Binding, values: Value[]): void;
}
