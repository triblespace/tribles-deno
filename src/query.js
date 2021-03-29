import { emptyValuePACT } from "./pact.js";

class IndexConstraint {
  constructor(variable, index) {
    this.cursor = index.segmentCursor();
    this.variable = variable;
    this.remainingVariables = 1;
  }

  propose() {
    if (this.remainingVariables === 0) return { done: true };
    return {
      done: false,
      variable: this.variable,
      costs: this.cursor.segmentCount(),
    };
  }

  push(variable, ascending) {
    if (variable === this.variable) {
      this.remainingVariables--;
      return [this.cursor.push(ascending)];
    }
    return [];
  }

  pop(variable) {
    if (variable === this.variable) {
      this.remainingVariables++;
      return this.cursor.pop();
    }
  }
}

const indexConstraint = (variable, index) => {
  return new IndexConstraint(variable, index);
};

const collectionConstraint = (variable, collection) => {
  const indexBatch = emptyValuePACT.batch();
  for (const c of collection) {
    indexBatch.put(c);
  }
  const index = indexBatch.complete();
  return new IndexConstraint(variable, index);
};

const constantConstraint = (variable, value) => {
  return new IndexConstraint(variable, emptyValuePACT.put(value));
};

//TODO VariableOrderConstraint vs order on resolve, e.g. before map like {x: y}, when x is choosen from propose we use y.

function* resolve(constraints, ascendingVariables, bindings = new Map()) {
  //init
  let candidateVariable;
  let candidateCosts = Number.MAX_VALUE;
  let allDone = true;
  for (const c of constraints) {
    const proposal = c.propose();
    if (proposal.done === false) {
      allDone = false;
      if (proposal.costs <= candidateCosts) {
        candidateVariable = proposal.variable;
        candidateCosts = proposal.costs;
      }
    }
  }

  if (allDone) {
    yield bindings;
  } else {
    const ascending = ascendingVariables.has(candidateVariable);

    const cursors = [];
    for (const c of constraints) {
      cursors.push(...c.push(candidateVariable, ascending));
    }

    let candidateOrigin = 0;
    let candidate = cursors[candidateOrigin].peek();
    let i = candidateOrigin;
    while (true) {
      i = (candidateOrigin + 1) % cursors.length;
      if (i === candidateOrigin) {
        bindings[candidateVariable] = candidate;
        yield* resolve(constraints, ascendingVariables, bindings);
        cursors[candidateOrigin].next();
        if (!cursors[candidateOrigin].isValid()) break;
        candidate = cursors[candidateOrigin].peek();
      } else {
        const match = cursors[i].seek(candidate);
        if (!cursors[i].isValid()) break;
        if (!match) {
          candidateOrigin = i;
          candidate = cursors[i].peek();
        }
      }
    }

    constraints.forEach((c) => c.pop(candidateVariable));
  }
  return;
}

export { collectionConstraint, constantConstraint, indexConstraint, resolve };
