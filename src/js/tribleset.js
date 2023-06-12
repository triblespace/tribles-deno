import {
  emptyIdIdValueTriblePACT,
  emptyIdValueIdTriblePACT,
  emptyValueIdIdTriblePACT,
  PaddedCursor,
} from "./pact.js";
import {
  scrambleAEV,
  scrambleAVE,
  scrambleEAV,
  scrambleEVA,
  scrambleVAE,
  scrambleVEA,
} from "./trible.js";
import { and } from "./constraints/and.js";
import { ByteBitset } from "./bitset.js";

/**
 * A constraint limits the passed variables e, a and v to values with
 * a corresponding eav trible existing in the passed tribleset.
 */
class TribleConstraint {
  constructor(tribleSet, e, a, v) {
    if (e === a || e === v || a == v) {
      throw new Error(
        "Triple variables must be uniqe. Use explicit equality when inner constraints are required.",
      );
    }

    this.eVar = e;
    this.aVar = a;
    this.vVar = v;
    this.eavCursor = new PaddedCursor(
      tribleSet.EAV.cursor(),
      tribleSet.EAV.segments,
      32,
    );
    this.evaCursor = new PaddedCursor(
      tribleSet.EVA.cursor(),
      tribleSet.EVA.segments,
      32,
    );
    this.aevCursor = new PaddedCursor(
      tribleSet.AEV.cursor(),
      tribleSet.AEV.segments,
      32,
    );
    this.aveCursor = new PaddedCursor(
      tribleSet.AVE.cursor(),
      tribleSet.AVE.segments,
      32,
    );
    this.veaCursor = new PaddedCursor(
      tribleSet.VEA.cursor(),
      tribleSet.VEA.segments,
      32,
    );
    this.vaeCursor = new PaddedCursor(
      tribleSet.VAE.cursor(),
      tribleSet.VAE.segments,
      32,
    );
  }

  variables() {
    let bitset = new ByteBitset();
    bitset.set(this.eVar);
    bitset.set(this.aVar);
    bitset.set(this.vVar);
    return bitset;
  }

  estimate(variable, binding) {
    let bound = binding.bound();
    const e = bound.has(this.eVar);
    const a = bound.has(this.aVar);
    const v = bound.has(this.vVar);

    if(e) {
      if(a) {
        if(v) {
          throw Error("bad state")
        } else {
          if(v === variable) {
            this.eav
          } else {
            throw Error("bad state")
          }
        }
      } else {
        if(v) {

        } else {
          
        }
      }
    } else {
      if(a) {
        if(v) {

        } else {
          
        }
      } else {
        if(v) {

        } else {
          
        }
      }
    }
  }

  *expand(variable, binding) {
    return this.constraint.expand(binding);
  }

  shrink(variable, value, binding) {
    return this.constraint.shrink(binding);
  }
}

/** A tribleset is an immutably persistent datastructure that stores tribles with set semantics.
 * It supports efficient set operations often take sub-linear time.
 */
export class TribleSet {
  constructor(
    EAV = emptyIdIdValueTriblePACT,
    EVA = emptyIdValueIdTriblePACT,
    AEV = emptyIdIdValueTriblePACT,
    AVE = emptyIdValueIdTriblePACT,
    VEA = emptyValueIdIdTriblePACT,
    VAE = emptyValueIdIdTriblePACT,
  ) {
    this.EAV = EAV;
    this.EVA = EVA;
    this.AEV = AEV;
    this.AVE = AVE;
    this.VEA = VEA;
    this.VAE = VAE;
  }

  /**
   * Returns a new tribleset containting both the tribles of this set
   * and the tribles passed in.
   */
  with(tribles) {
    const EAV = this.EAV.batch();
    const EVA = this.EVA.batch();
    const AEV = this.AEV.batch();
    const AVE = this.AVE.batch();
    const VEA = this.VEA.batch();
    const VAE = this.VAE.batch();

    for (const trible of tribles) {
      EAV.put(scrambleEAV(trible));
      EVA.put(scrambleEVA(trible));
      AEV.put(scrambleAEV(trible));
      AVE.put(scrambleAVE(trible));
      VEA.put(scrambleVEA(trible));
      VAE.put(scrambleVAE(trible));
    }

    return new TribleSet(
      EAV.complete(),
      EVA.complete(),
      AEV.complete(),
      AVE.complete(),
      VEA.complete(),
      VAE.complete(),
    );
  }

  /**
   * Provides a way to dump all tribles this db in EAV lexicographic order.
   * @returns an iterator of tribles
   */
  tribles() {
    return this.EAV.keys();
  }

  /**
   * Returns a single trible constraint ensuring that there exists a corresponding
   * eav trible in this set for the passed e, a and v variables.
   */
  tripleConstraint([e, a, v]) {
    return new TribleConstraint(this, e.index, a.index, v.index);
  }

  /**
   * Returns a constraint ensuring that there is a corresponding trible in this
   * tribleset for each triple passed in the pattern.
   * This is equivalent to performing an `and`/conjunction over multiple tripleConstraint
   * calls, but allows for a potentially more efficient execution (see commits).
   */
  patternConstraint(triples) {
    return and(
      ...triples.map(([e, a, v]) =>
        new TribleConstraint(this, e.index, a.index, v.index)
      ),
    );
  }

  /**
   * @returns The number of tribles stored in this set.
   */
  count() {
    return this.EAV.count();
  }

  /**
   * @returns A tribleset of the same type as this one with all contents removed.
   */
  empty() {
    return new TribleSet();
  }

  /**
   * @returns A bool indicating if this tribleset contains any tribles.
   */
  isEmpty() {
    return this.EAV.isEmpty();
  }

  /**
   * Compares two triblesets and returns wether they are equal.
   */
  isEqual(other) {
    return this.EAV.isEqual(other.EAV);
  }
  /**
   * Checks if this tribleset is a subset of the passed tribleset,
   * i.e. if every trible of this set is also contained in the passed set.
   */
  isSubsetOf(other) {
    return this.EAV.isSubsetOf(other.indexE);
  }

  /**
   * Checks if this tribleset has an intersection with the passed set,
   * i.e. if there exists a trible that is contained in both sets.
   */
  isIntersecting(other) {
    return this.EAV.isIntersecting(other.indexE);
  }

  /**
   * Returns a new tribleset that is the union of this set and the passed set,
   * i.e. a set that contains any trible that is in either of the input sets.
   */
  union(other) {
    return new TribleSet(
      this.EAV.union(other.EAV),
      this.EVA.union(other.EVA),
      this.AEV.union(other.AEV),
      this.AVE.union(other.AVE),
      this.VEA.union(other.VEA),
      this.VAE.union(other.VAE),
    );
  }

  /**
   * Returns a new tribleset that contains the tribles of this set
   * with the tribles of the passed set subtracted,
   * i.e. a set that contains any trible that is in this set but not in the passed set.
   */
  subtract(other) {
    return new TribleSet(
      this.EAV.subtract(other.EAV),
      this.EVA.subtract(other.EVA),
      this.AEV.subtract(other.AEV),
      this.AVE.subtract(other.AVE),
      this.VEA.subtract(other.VEA),
      this.VAE.subtract(other.VAE),
    );
  }

  /**
   * Returns a new tribleset that contains the difference of this set and
   * the passed set, i.e. a set that contains any trible that is in one of
   * the sets but not in the other.
   */
  difference(other) {
    return new TribleSet(
      this.EAV.difference(other.EAV),
      this.EVA.difference(other.EVA),
      this.AEV.difference(other.AEV),
      this.AVE.difference(other.AVE),
      this.VEA.difference(other.VEA),
      this.VAE.difference(other.VAE),
    );
  }

  /**
   * Returns a new tribleset that contains the intersection of this set and
   * the passed set, i.e. a set that contains any trible that is in both of
   * the sets.
   */
  intersect(other) {
    return new TribleSet(
      this.EAV.intersect(other.EAV),
      this.EVA.intersect(other.EVA),
      this.AEV.intersect(other.AEV),
      this.AVE.intersect(other.AVE),
      this.VEA.intersect(other.VEA),
      this.VAE.intersect(other.VAE),
    );
  }
}
