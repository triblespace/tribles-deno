import { SEGMENT_SIZE } from "./trible.js";
import { emptySegmentPart, emptyValuePART } from "./part.js";

class ConstantConstraint {
  constructor(variable, constant) {
    this.variable = variable;
    this.constant = constant;
    this.ascending = true;
    this.valid = true;
  }

  propose() {
    return { variable: this.variable, count: 1, forced: false };
  }

  push(variable, ascending = true) {
    if (variable !== this.variable) return { relevant: false, done: false };
    this.ascending = ascending;
    return { relevant: true, done: true };
  }

  pop() {
    this.valid = true;
  }

  peek() {
    return this.constant;
  }

  next() {
    this.valid = false;
  }

  seek(value) {
    if (this.ascending) {
      for (let i = 0; i < SEGMENT_SIZE; i++) {
        if (this.constant[i] !== value[i]) {
          if (this.constant[i] < value[i]) this.valid = false;
          return false;
        }
      }
    } else {
      for (let i = 0; i < SEGMENT_SIZE; i++) {
        if (this.constant[i] !== value[i]) {
          if (this.constant[i] > value[i]) this.valid = false;
          return false;
        }
      }
    }
    return true;
  }
}

class SegmentIndexConstraint {
  constructor(variable, index) {
    this.index = index;
    this.cursor = index.cursor();
    this.variable = variable;
    this.ascending = true;
  }

  propose() {
    return { variable: this.variable, count: this.index.count, forced: false };
  }

  push(variable, ascending) {
    if (variable !== this.variable) return { relevant: false, done: false };
    this.cursor.push(SEGMENT_SIZE, ascending);
    return { relevant: true, done: true };
  }

  pop() {
    this.cursor.pop();
  }

  valid() {
    return this.cursor.valid;
  }

  peek() {
    return this.cursor.peek();
  }

  next() {
    this.cursor.next();
  }

  seek(value) {
    return this.cursor.seek(value);
  }
}

class ValueIndexConstraint {
  constructor(variable1, variable2, index) {
    this.variable1 = variable1;
    this.variable2 = variable2;

    this.pushed = false;

    this.cursor = index.cursor();
  }

  propose() {
    if (!this.pushed) {
      return {
        variable: this.variable1,
        count: this.C1.count,
        forced: false,
      };
    } else {
      return {
        variable: this.variable2,
        count: this.cursorC1.value().count,
        forced: false,
      };
    }
  }

  push(variable, ascending) {
    if (!this.pushed) {
      if (variable !== this.variable1) return { relevant: false, done: false };
      this.cursor.push(SEGMENT_SIZE, ascending);
      this.pushed = true;
      return { relevant: true, done: false };
    } else {
      if (variable !== this.variable2) return { relevant: false, done: false };
      this.cursor.push(SEGMENT_SIZE, ascending);
      return { relevant: true, done: true };
    }
  }

  pop() {
    this.pushed = false;
    this.cursor.pop();
  }

  valid() {
    return this.cursor.valid;
  }

  peek() {
    return this.cursor.peek();
  }

  next() {
    this.cursor.next();
  }

  seek(value) {
    return this.cursor.seek(value);
  }
}

class TripleConstraint {
  constructor(db, variableE, variableA, variableV1, variableV2) {
    this.variableE = variableE;
    this.variableA = variableA;
    this.variableV1 = variableV1;
    this.variableV2 = variableV2;
    this.cursorEAV = db.EAV.cursor();
    this.cursorEVA = db.EVA.cursor();
    this.cursorAEV = db.AEV.cursor();
    this.cursorAVE = db.AVE.cursor();
    this.cursorVEA = db.VEA.cursor();
    this.cursorVAE = db.VAE.cursor();
    this.index = "ROOT";
  }

  propose() {
    let count;
    let variable;
    let forced = false;
    switch (this.index) {
      case "ROOT":
        {
          const countE = this.cursorEAV.countSubsegment();
          const countA = this.cursorAVE.countSubsegment();
          const countV = this.cursorVAE.countSubsegment();

          count = countE;
          variable = this.variableE;

          if (countA <= count) {
            count = countA;
            variable = this.variableE;
          }
          if (countV <= count) {
            count = countV;
            variable = this.variableE;
          }
        }
        break;
      case "E":
        {
          const countA = this.cursorEAV.countSubsegment();
          const countV = this.cursorEVA.countSubsegment();
          count = countA;
          variable = this.variableE;
          if (countV <= count) {
            count = countV;
            variable = this.variableE;
          }
        }
        break;
      case "A":
        {
          const countE = this.cursorAEV.countSubsegment();
          const countV = this.cursorAVE.countSubsegment();
          count = countE;
          variable = this.variableE;
          if (countV <= count) {
            count = countV;
            variable = this.variableE;
          }
        }
        break;
    }

    return {
      variable,
      count,
      forced,
    };
  }

  push(variable, ascending = true) {
    let branch;
    if (this.cursors.length === 0) {
      branch = this.db.index;
    } else {
      branch = this.cursors[this.cursors.length - 1].value();
    }

    const done = this.cursors.length === 3;
    if (variable === this.variableE) {
      this.cursors.push(branch.E.cursor(ascending));
      return { relevant: true, done };
    }
    if (variable === this.variableA) {
      this.cursors.push(branch.A.cursor(ascending));
      return { relevant: true, done };
    }
    if (variable === this.variableV1) {
      this.cursors.push(branch.V1.cursor(ascending));
      return { relevant: true, done };
    }
    if (variable === this.variableV2) {
      this.cursors.push(branch.V2.cursor(ascending));
      return { relevant: true, done };
    }
    return { relevant: false, done };
  }

  pop() {
    this.cursors.pop();
  }

  valid() {
    this.cursors[this.cursors.length - 1].valid;
  }

  peek() {
    if (this.cursors[this.cursors.length - 1].valid) {
      return this.cursor.peek();
    }
    return null;
  }

  next() {
    this.cursors[this.cursors.length - 1].next();
  }

  seek(value) {
    return this.cursors[this.cursors.length - 1].seek(value);
  }
}

//TODO class VariableOrderConstraint {

function* query(constraints, ascendingVariables, bindings = new Map()) {
  //init
  let candidateVariable;
  let candidateCount = Number.MAX_VALUE;
  for (const c of constraints) {
    const proposal = c.propose();
    if (proposal.count === 0) {
      return;
    }
    if (!proposal.forced) {
      candidateVariable = proposal.variable;
      break;
    }
    if (proposal.count <= candidateCount) {
      candidateVariable = proposal.variable;
      candidateCount = proposal.count;
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
  query,
  TripleConstraint,
};
