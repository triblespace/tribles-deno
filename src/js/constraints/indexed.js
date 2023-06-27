// This constraint is used when there is a fixed number of possible values for a variable.
// As with a collection where items should exist in, or when enumerating attributes from a namespace
// during a walk.
class IndexConstraint {
  constructor(variable, index) {
    this.index = index;
    this.variable = variable;
  }

  variables() {
    let bitset = new ByteBitset();
    bitset.set(this.variable);
    return bitset;
  }

  estimate(variable, binding) {
    return this.index.count();
  }

  *expand(variable, binding) {
    yield* this.index.keys();
  }

  shrink(variable, value, binding) {
    return !this.index.has(value);
  }
}

/**
 * Create a constraint for the given variable to the values of the provided index.
 * @param {Variable} variable - The constrained variable.
 * @param {PACT} index - The constant values.
 * @returns {Constraint} The constraint usable with other constraints or `find`.
 */
export function indexed(variable, index) {
  return new IndexConstraint(variable.index, index);
}

/**
 * Create a constraint for the given variable to the provided constant values.
 * @param {Variable} variable - The constrained variable.
 * @param {[Uint32Array]} collection - The constant values.
 * @returns {Constraint} The constraint usable with other constraints or `find`.
 */
export function collection(variable, collection) {
  const indexBatch = emptyValuePACT.batch();
  for (const c of collection) {
    indexBatch.put(c);
  }
  const index = indexBatch.complete();
  return new IndexConstraint(variable.index, index);
}