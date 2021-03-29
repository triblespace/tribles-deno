import { emptyTriblePACT } from "./pact.js";
import {
  A,
  E,
  equalId,
  scrambleAEV,
  scrambleAVE,
  scrambleEAV,
  scrambleEVA,
  scrambleVAE,
  scrambleVEA,
  V,
  zero,
} from "./trible.js";

const inmemoryCosts = 1; //TODO estimate and change to microseconds.
// TODO return both count and latency. Cost = min count * max latency;

class MemTribleConstraint {
  constructor(cursors, variableE, variableA, variableV) {
    this.variables = { e: variableE, a: variableA, v: variableV };
    this.pathStack = [[""]];
    this.cursors = cursors;
    this.remainingVariables = 3;
  }

  propose() {
    if (this.remainingVariables === 0) return { done: true };
    let count = Number.MAX_VALUE;
    let segment = null;

    const paths = this.pathStack[this.pathStack.length - 1];
    for (const [name, cursor] of Object.entries(this.cursors)) {
      if (paths.some((p) => name.startsWith(p))) {
        const proposedCount = cursor.segmentCount();
        if (proposedCount <= count) {
          count = proposedCount;
          segment = name[this.pathStack.length - 1];
        }
      }
    }
    return {
      done: false,
      variable: this.variables[segment],
      costs: count * inmemoryCosts,
    };
  }

  push(variable, ascending = true) {
    const paths = new Set();
    for (const [s, v] of Object.entries(this.variables)) {
      if (v === variable) {
        this.remainingVariables--;
        for (const path of this.pathStack[this.pathStack.length - 1]) {
          paths.add(path + s);
        }
      }
    }

    const cursors = [];
    for (const [name, cursor] of Object.entries(this.cursors)) {
      if ([...paths].some((p) => name.startsWith(p))) {
        cursors.push(cursor.push());
      }
    }
    this.pathStack.push(paths);
    return cursors;
  }

  pop(variable) {
    let relevant = false;
    for (const [s, v] of Object.entries(this.variables)) {
      if (v === variable) {
        this.remainingVariables++;
        relevant = true;
      }
    }
    if (relevant) {
      for (const path of this.pathStack.pop()) {
        for (const [name, cursor] of Object.entries(this.cursors)) {
          if (name.startsWith(path)) {
            cursor.pop();
          }
        }
      }
    }
  }
}

class MemTribleDB {
  constructor(
    EAV = emptyTriblePACT,
    EVA = emptyTriblePACT,
    AEV = emptyTriblePACT,
    AVE = emptyTriblePACT,
    VEA = emptyTriblePACT,
    VAE = emptyTriblePACT,
  ) {
    this.EAV = EAV;
    this.EVA = EVA;
    this.AEV = AEV;
    this.AVE = AVE;
    this.VEA = VEA;
    this.VAE = VAE;
  }

  with(tribles) {
    const EAV = this.EAV.batch();
    const EVA = this.EVA.batch();
    const AEV = this.AEV.batch();
    const AVE = this.AVE.batch();
    const VEA = this.VEA.batch();
    const VAE = this.VEA.batch();

    for (const trible of tribles) EAV.put(scrambleEAV(trible));
    for (const trible of tribles) EVA.put(scrambleEVA(trible));
    for (const trible of tribles) AEV.put(scrambleAEV(trible));
    for (const trible of tribles) AVE.put(scrambleAVE(trible));
    for (const trible of tribles) VEA.put(scrambleVEA(trible));
    for (const trible of tribles) VAE.put(scrambleVAE(trible));

    return new MemTribleDB(
      EAV.complete(),
      EVA.complete(),
      AEV.complete(),
      AVE.complete(),
      VEA.complete(),
      VAE.complete(),
    );
  }

  constraint(e, a, v) {
    return new MemTribleConstraint(
      {
        eav: this.EAV.segmentCursor(),
        eva: this.EVA.segmentCursor(),
        aev: this.AEV.segmentCursor(),
        ave: this.AVE.segmentCursor(),
        vea: this.VEA.segmentCursor(),
        vae: this.VAE.segmentCursor(),
      },
      e,
      a,
      v,
    );
  }

  empty() {
    return new MemTribleDB();
  }

  isEmpty() {
    return this.EAV.isEmpty();
  }

  isEqual(other) {
    return this.EAV.isEqual(other.EAV);
  }

  isSubsetOf(other) {
    return this.EAV.isSubsetOf(other.indexE);
  }

  isIntersecting(other) {
    return this.EAV.isIntersecting(other.indexE);
  }

  union(other) {
    return new MemTribleDB(
      this.EAV.union(other.EAV),
      this.EVA.union(other.EVA),
      this.AEV.union(other.AEV),
      this.AVE.union(other.AVE),
      this.VEA.union(other.VEA),
      this.VAE.union(other.VAE),
    );
  }

  subtract(other) {
    return new MemTribleDB(
      this.EAV.subtract(other.EAV),
      this.EVA.subtract(other.EVA),
      this.AEV.subtract(other.AEV),
      this.AVE.subtract(other.AVE),
      this.VEA.subtract(other.VEA),
      this.VAE.subtract(other.VAE),
    );
  }

  difference(other) {
    return new MemTribleDB(
      this.EAV.difference(other.EAV),
      this.EVA.difference(other.EVA),
      this.AEV.difference(other.AEV),
      this.AVE.difference(other.AVE),
      this.VEA.difference(other.VEA),
      this.VAE.difference(other.VAE),
    );
  }

  intersect(other) {
    return new MemTribleDB(
      this.EAV.intersect(other.EAV),
      this.EVA.intersect(other.EVA),
      this.AEV.intersect(other.AEV),
      this.AVE.intersect(other.AVE),
      this.VEA.intersect(other.VEA),
      this.VAE.intersect(other.VAE),
    );
  }
}

export { MemTribleDB };
