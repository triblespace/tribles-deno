import { SEGMENT_SIZE } from "./trible.js";
import { emptyValuePACT } from "./pact.js";

class CollectionConstraint {
  constructor(variable, collection) {
    const indexBatch = emptyValuePACT.batch();
    for (const c of collection) {
      indexBatch.put(c);
    }
    this.index = indexBatch.complete();
    this.cursor = this.index.cursor();
    this.variable = variable;
  }

  propose() {
    return { variable: this.variable, costs: this.index.segmentCount() };
  }

  push(variable, ascending) {
    if (variable === this.variable) {
      return [this.cursor.push(ascending)];
    }
    return [];
  }

  pop() {
    return this.cursor.pop();
  }
}

//TODO VariableOrderConstraint vs order on resolve, e.g. before map like {x: y}, when x is choosen from propose we use y.

function* resolve(constraints, ascendingVariables, bindings = new Map()) {
  //init
  let candidateVariable;
  let candidateCosts = Number.MAX_VALUE;
  for (const c of constraints) {
    const proposal = c.propose();
    if (proposal.costs <= candidateCosts) {
      candidateVariable = proposal.variable;
      candidateCosts = proposal.costs;
    }
  }

  const ascending = ascendingVariables.has(candidateVariable);

  const restConstraints = [];
  const currentConstraints = [];
  for (const c of constraints) {
    const pushed = c.push(ascending);
    if (!pushed.done) {
      restConstraints.push(c);
    }
    if (pushed.relevant) {
      currentConstraints.push(c);
    }
  }

  const lastVariable = restConstraints.length === 0;

  let candidateOrigin = 0;
  let candidate = currentConstraints[candidateOrigin].peek();
  let i = candidateOrigin;
  while (true) {
    i = (candidateOrigin + 1) % currentConstraints.length;
    if (i === candidateOrigin) {
      bindings[candidateVariable] = candidate;
      if (lastVariable) {
        yield bindings;
      } else {
        yield* resolve(restConstraints, ascendingVariables, bindings);
      }
      currentConstraints[candidateOrigin].next();
      if (!currentConstraints[candidateOrigin].valid) break;
      candidate = currentConstraints[candidateOrigin].peek();
    } else {
      const match = currentConstraints[i].seek(candidate);
      if (!currentConstraints[i].valid) break;
      if (!match) {
        candidateOrigin = i;
        candidate = currentConstraints[i].peek();
      }
    }
  }

  currentConstraints.forEach((c) => c.pop());
  return;
}

export { CollectionConstraint, resolve };
