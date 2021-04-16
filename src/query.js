import { emptyValuePACT, nextKey } from "./pact.js";
import { VALUE_SIZE } from "./trible.js";

class IndexConstraint {
  constructor(variable, index) {
    this.cursor = index.segmentCursor();
    this.variable = variable;
    this.done = false;
  }

  propose() {
    if (this.done) return [];
    return [{
      variable: this.variable,
      costs: [this.cursor.segmentCount()],
    }];
  }

  push(variable, ascending) {
    if (variable === this.variable) {
      this.done = true;
      return [this.cursor.push(ascending)];
    }
    return [];
  }

  pop(variable) {
    if (variable === this.variable) {
      this.done = false;
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

class OrderByMinCostAndBlockage {
  constructor(blockedBy) {
    this.blockedBy = blockedBy;
    this.exploredVariables = new Set();
  }

  propose(constraints) {
    let candidateVariable = null;
    let candidateCosts = Number.MAX_VALUE;
    for (const c of constraints) {
      for (const proposal of c.propose()) {
        const minCosts = Math.min(...proposal.costs);
        const variable = proposal.variable;
        if (
          minCosts <= candidateCosts &&
          this.blockedBy.every(([blocked, blocker]) =>
            variable !== blocked || this.exploredVariables.has(blocker)
          )
        ) {
          candidateVariable = variable;
          candidateCosts = minCosts;
        }
      }
    }
    return candidateVariable;
  }

  push(variable) {
    this.exploredVariables.add(variable);
  }

  pop(variable) {
    this.exploredVariables.delete(variable);
  }
}

class OrderByMinCost {
  constructor() {
  }

  propose(constraints) {
    let candidateVariable = null;
    let candidateCosts = Number.MAX_VALUE;
    for (const c of constraints) {
      for (const proposal of c.propose()) {
        const minCosts = Math.min(...proposal.costs);
        const variable = proposal.variable;
        if (
          minCosts <= candidateCosts
        ) {
          candidateVariable = variable;
          candidateCosts = minCosts;
        }
      }
    }
    return candidateVariable;
  }

  push(variable) {
  }

  pop(variable) {
  }
}

function* resolve(constraints, ordering, ascendingVariables, bindings) {
  //init
  const variable = ordering.propose(constraints);
  if (variable === null) {
    yield bindings;
  } else {
    const ascending = ascendingVariables.has(variable);

    ordering.push(variable);

    const cursors = [];
    for (const c of constraints) {
      cursors.push(...c.push(variable, ascending));
    }

    const candidate = bindings[variable].fill(0); //TODO: could we use this to replace the state in the cursors?
    let i = 0;
    let candidateOrigin = i;
    while (true) {
      if (!cursors[i].peek(candidate)) break;
      i = (i + 1) % cursors.length;
      if (i === candidateOrigin) {
        yield* resolve(constraints, ordering, ascendingVariables, bindings);
        if (!nextKey(candidate, ascending)) break;
        cursors[i].seek(candidate);
      } else {
        const match = cursors[i].seek(candidate);
        if (!match) {
          candidateOrigin = i;
        }
      }
    }

    constraints.forEach((c) => c.pop(variable));
    ordering.pop(variable);
  }
  return;
}

export {
  collectionConstraint,
  constantConstraint,
  indexConstraint,
  OrderByMinCost,
  OrderByMinCostAndBlockage,
  resolve,
};
