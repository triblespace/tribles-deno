import { SEGMENT_SIZE } from "./trible.js";
import { emptyValuePART } from "./cuckoopartint32.js";

class CollectionConstraint {
  constructor(variable, collection) {
    const indexBatch = emptyValuePART.batch();
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
    if (variable === this.variable) {
      return this.cursor.pop();
    }
  }
}

const inmemoryCosts = 1; //TODO estimate and change to microseconds.
// TODO return both count and latency. Cost = min count * max latency;

class TripleConstraint {
  constructor(db, variableE, variableA, variableV) {
    this.variables = { e: variableE, a: variableA, v: variableV };
    this.pathStack = [[""]];
    this.cursors = {
      eav: db.EAV.cursor(),
      eva: db.EVA.cursor(),
      aev: db.AEV.cursor(),
      ave: db.AVE.cursor(),
      vea: db.VEA.cursor(),
      vae: db.VAE.cursor(),
    };
  }

  propose() {
    let count = Number.MAX_VALUE;
    let segment = null;

    const paths = this.pathStack[this.pathStack.length - 1];
    for (const [name, cursor] of Object.entries(this.cursors)) {
      if (paths.some((p) => name.startsWith(p))) {
        const proposedCount = cursor.countSubsegment();
        if (proposedCount <= count) {
          count = proposedCount;
          segment = name[this.path.length];
        }
      }
    }
    return {
      variable: this.variables[segment],
      costs: count * inmemoryCosts,
    };
  }

  push(variable, ascending = true) {
    const paths = new Set();
    for (const [s, v] of Object.entries(this.variables)) {
      if (v === variable) {
        for (const path of this.pathStack[this.pathStack.length - 1]) {
          paths.push(path + s);
        }
      }
    }

    const cursors = [];
    for (const [name, cursor] of Object.entries(this.cursors)) {
      if (paths.some((p) => name.startsWith(p))) {
        cursors.push(cursor.push());
      }
    }
    this.pathStack.push(paths);
    return cursors;
  }

  pop() {
    for (const path of this.pathStack.pop()) {
      for (const [name, cursor] of Object.entries(this.cursors)) {
        if (name.startsWith(path)) {
          cursor.pop();
        }
      }
    }
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

export {
  CollectionConstraint,
  ConstantConstraint,
  IndexConstraint,
  resolve,
  TripleConstraint,
};
