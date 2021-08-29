import {
  emptyIdIdValueTriblePACT,
  emptyIdValueIdTriblePACT,
  emptyValueIdIdTriblePACT,
} from "./pact.js";
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
  V1,
  V2,
  zero,
} from "./trible.js";

const inmemoryCosts = 1; //TODO estimate and change to microseconds.
// TODO return both count and latency. Cost = min count * max latency;

class MemTribleConstraint {
  constructor(variableTree) {
    this.explorationStack = [variableTree];
  }

  propose() {
    const lastExplored =
      this.explorationStack[this.explorationStack.length - 1];
    return lastExplored.children.map((child) => ({
      variable: child.variable,
      costs: child.cursors.map(
        (cursor) => cursor.segmentCount() * inmemoryCosts
      ),
    }));
  }

  push(variable, ascending = true) {
    const lastExplored =
      this.explorationStack[this.explorationStack.length - 1];
    let nextExplored = null;
    for (const child of lastExplored.children) {
      if (child.variable === variable) {
        nextExplored = child;
      }
    }
    if (nextExplored === null) return [];
    this.explorationStack.push(nextExplored);
    for (const cursor of nextExplored.cursors) {
      cursor.push(ascending);
    }
    return nextExplored.cursors;
  }

  pop(variable) {
    const lastExplored =
      this.explorationStack[this.explorationStack.length - 1];
    if (lastExplored.variable === variable) {
      for (const cursor of lastExplored.cursors) {
        cursor.pop();
      }
      this.explorationStack.pop();
    }
  }
}

class TribleSet {
  constructor(
    EAV = emptyIdIdValueTriblePACT,
    EVA = emptyIdValueIdTriblePACT,
    AEV = emptyIdIdValueTriblePACT,
    AVE = emptyIdValueIdTriblePACT,
    VEA = emptyValueIdIdTriblePACT,
    VAE = emptyValueIdIdTriblePACT,
    EisA = emptyIdIdValueTriblePACT, // Same order as EAV
    EisV = emptyIdIdValueTriblePACT, // Same order as EAV
    AisV = emptyIdIdValueTriblePACT // Same order as AEV
  ) {
    this.EAV = EAV;
    this.EVA = EVA;
    this.AEV = AEV;
    this.AVE = AVE;
    this.VEA = VEA;
    this.VAE = VAE;
    this.EisA = EisA;
    this.EisV = EisV;
    this.AisV = AisV;
  }

  with(tribles) {
    const EAV = this.EAV.batch();
    const EVA = this.EVA.batch();
    const AEV = this.AEV.batch();
    const AVE = this.AVE.batch();
    const VEA = this.VEA.batch();
    const VAE = this.VAE.batch();
    const EisA = this.EisA.batch();
    const EisV = this.EisV.batch();
    const AisV = this.AisV.batch();

    for (const trible of tribles) EAV.put(scrambleEAV(trible));
    for (const trible of tribles) EVA.put(scrambleEVA(trible));
    for (const trible of tribles) AEV.put(scrambleAEV(trible));
    for (const trible of tribles) AVE.put(scrambleAVE(trible));
    for (const trible of tribles) VEA.put(scrambleVEA(trible));
    for (const trible of tribles) VAE.put(scrambleVAE(trible));

    for (const trible of tribles) {
      const e = E(trible);
      const a = A(trible);
      const v1 = V1(trible);
      const v2 = V2(trible);
      const eIsA = equalId(e, a);
      const eIsV = zero(v1) && equalId(e, v2);
      const aIsV = zero(v1) && equalId(a, v2);

      if (eIsA) {
        EisA.put(scrambleEAV(trible));
      }
      if (eIsV) {
        EisV.put(scrambleEAV(trible));
      }
      if (aIsV) {
        AisV.put(scrambleAEV(trible));
      }
    }

    return new TribleSet(
      EAV.complete(),
      EVA.complete(),
      AEV.complete(),
      AVE.complete(),
      VEA.complete(),
      VAE.complete(),
      EisA.complete(),
      EisV.complete(),
      AisV.complete()
    );
  }

  /**
   * Provides a way to dump all tribles this db in EAV lexicographic order.
   * @returns an iterator of tribles
   */
  tribles() {
    return this.EAV.keys();
  }

  constraint(e, a, v) {
    const EAVCursor = this.EAV.segmentCursor();
    const EVACursor = this.EVA.segmentCursor();
    const AEVCursor = this.AEV.segmentCursor();
    const AVECursor = this.AVE.segmentCursor();
    const VEACursor = this.VEA.segmentCursor();
    const VAECursor = this.VAE.segmentCursor();
    const EisACursor = this.EisA.segmentCursor();
    const EisVCursor = this.EisV.segmentCursor();
    const AisVCursor = this.AisV.segmentCursor();

    if (e === a && e === v) {
      return new MemTribleConstraint({
        children: [{ variable: e, cursors: [EisACursor, EisVCursor] }],
      });
    }
    if (e === a) {
      return new MemTribleConstraint({
        children: [
          {
            variable: e,
            cursors: [EVACursor, EisACursor],
            children: [{ variable: v, cursors: [EVACursor], children: [] }],
          },
          {
            variable: v,
            cursors: [VEACursor],
            children: [
              {
                variable: e,
                cursors: [VEACursor, EisACursor],
                children: [],
              },
            ],
          },
        ],
      });
    }
    if (e === v) {
      return new MemTribleConstraint({
        children: [
          {
            variable: e,
            cursors: [EAVCursor, EisVCursor],
            children: [{ variable: a, cursors: [EAVCursor], children: [] }],
          },
          {
            variable: a,
            cursors: [AEVCursor],
            children: [
              {
                variable: e,
                cursors: [AEVCursor, EisVCursor],
                children: [],
              },
            ],
          },
        ],
      });
    }
    if (a === v) {
      return new MemTribleConstraint({
        children: [
          {
            variable: e,
            cursors: [EAVCursor],
            children: [
              {
                variable: a,
                cursors: [EAVCursor, AisVCursor],
                children: [],
              },
            ],
          },
          {
            variable: a,
            cursors: [AEVCursor, AisVCursor],
            children: [{ variable: e, cursors: [AEVCursor], children: [] }],
          },
        ],
      });
    }
    return new MemTribleConstraint({
      children: [
        {
          variable: e,
          cursors: [EAVCursor, EVACursor],
          children: [
            {
              variable: a,
              cursors: [EAVCursor],
              children: [{ variable: v, cursors: [EAVCursor], children: [] }],
            },
            {
              variable: v,
              cursors: [EVACursor],
              children: [{ variable: a, cursors: [EVACursor], children: [] }],
            },
          ],
        },
        {
          variable: a,
          cursors: [AEVCursor, AVECursor],
          children: [
            {
              variable: e,
              cursors: [AEVCursor],
              children: [{ variable: v, cursors: [AEVCursor], children: [] }],
            },
            {
              variable: v,
              cursors: [AVECursor],
              children: [{ variable: e, cursors: [AVECursor], children: [] }],
            },
          ],
        },
        {
          variable: v,
          cursors: [VEACursor, VAECursor],
          children: [
            {
              variable: e,
              cursors: [VEACursor],
              children: [{ variable: a, cursors: [VEACursor], children: [] }],
            },
            {
              variable: a,
              cursors: [VAECursor],
              children: [{ variable: e, cursors: [VAECursor], children: [] }],
            },
          ],
        },
      ],
    });
  }

  empty() {
    return new TribleSet();
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
    return new TribleSet(
      this.EAV.union(other.EAV),
      this.EVA.union(other.EVA),
      this.AEV.union(other.AEV),
      this.AVE.union(other.AVE),
      this.VEA.union(other.VEA),
      this.VAE.union(other.VAE),
      this.EisA.union(other.EisA),
      this.EisV.union(other.EisV),
      this.AisV.union(other.AisV)
    );
  }

  subtract(other) {
    return new TribleSet(
      this.EAV.subtract(other.EAV),
      this.EVA.subtract(other.EVA),
      this.AEV.subtract(other.AEV),
      this.AVE.subtract(other.AVE),
      this.VEA.subtract(other.VEA),
      this.VAE.subtract(other.VAE),
      this.EisA.subtract(other.EisA),
      this.EisV.subtract(other.EisV),
      this.AisV.subtract(other.AisV)
    );
  }

  difference(other) {
    return new TribleSet(
      this.EAV.difference(other.EAV),
      this.EVA.difference(other.EVA),
      this.AEV.difference(other.AEV),
      this.AVE.difference(other.AVE),
      this.VEA.difference(other.VEA),
      this.VAE.difference(other.VAE),
      this.EisA.difference(other.EisA),
      this.EisV.difference(other.EisV),
      this.AisV.difference(other.AisV)
    );
  }

  intersect(other) {
    return new TribleSet(
      this.EAV.intersect(other.EAV),
      this.EVA.intersect(other.EVA),
      this.AEV.intersect(other.AEV),
      this.AVE.intersect(other.AVE),
      this.VEA.intersect(other.VEA),
      this.VAE.intersect(other.VAE),
      this.EisA.intersect(other.EisA),
      this.EisV.intersect(other.EisV),
      this.AisV.intersect(other.AisV)
    );
  }
}

export { TribleSet };
