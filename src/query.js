import { emptyValuePACT, nextKey } from "./pact.js";
import { ID_SIZE, VALUE_SIZE } from "./trible.js";

class IndexConstraint {
  constructor(variable, index) {
    this.cursor = index.segmentCursor();
    this.variable = variable;
    this.done = false;
  }

  propose() {
    if (this.done) return [];
    return [
      {
        variable: this.variable,
        costs: [this.cursor.segmentCount()],
      },
    ];
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

const constantConstraint = (variable, constant) => {
  let value;
  if (constant.length === ID_SIZE) {
    value = new Uint8Array(VALUE_SIZE);
    value.set(constant, 16);
  } else {
    value = constant;
  }
  return new IndexConstraint(variable, emptyValuePACT.put(value));
};

class OrderByMinCostAndBlockage {
  constructor(projected, blockedBy = []) {
    this.blockedBy = blockedBy;
    this.projected = projected;
    this.projectCount = projected.size;
    this.omitCount = 0;
    this.exploredVariables = new Set();
    this.isProjection = false;
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
          (this.projectCount === 0 || this.projected.has(variable)) &&
          this.blockedBy.every(
            ([blocked, blocker]) =>
              variable !== blocked || this.exploredVariables.has(blocker),
          )
        ) {
          candidateVariable = variable;
          candidateCosts = minCosts;
        }
      }
    }
    //if (candidateCosts < 0) console.log(candidateVariable, candidateCosts);
    return candidateVariable;
  }

  shortcircuit() {
    return !this.isProjection;
  }

  push(variable) {
    this.exploredVariables.add(variable);
    if ((this.isProjection = this.projected.has(variable))) {
      this.projectCount--;
    } else {
      this.omitCount++;
    }
  }

  pop(variable) {
    this.exploredVariables.delete(variable);
    if (this.projected.has(variable)) {
      this.projectCount++;
    } else {
      this.omitCount--;
    }
    this.isProjection = this.omitCount === 0;
  }
}

function* resolve(constraints, ordering, ascendingVariables, bindings) {
  //init
  let hasResult = false;
  const variable = ordering.propose(constraints);
  if (variable === null) {
    yield bindings;
    hasResult = true;
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
        const newHasResult = yield* resolve(
          constraints,
          ordering,
          ascendingVariables,
          bindings,
        );
        hasResult ||= newHasResult;
        if (
          (hasResult && ordering.shortcircuit()) ||
          !nextKey(candidate, ascending)
        ) {
          break;
        }
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
  return hasResult;
}

export {
  collectionConstraint,
  constantConstraint,
  indexConstraint,
  OrderByMinCostAndBlockage,
  resolve,
};
