import {
  Entry,
  emptyEAVTriblePATCH,
  emptyEVATriblePATCH,
  emptyAEVTriblePATCH,
  emptyAVETriblePATCH,
  emptyVEATriblePATCH,
  emptyVAETriblePATCH,
  batch
} from "./patch.ts";
import { and } from "./constraints/and.ts";
import { Trible } from "./trible.ts";
import { Variable } from "./query.ts";
import { TribleConstraint } from "./constraints/trible.ts";
import { Constraint } from "./constraints/constraint.ts";

/** A tribleset is an immutably persistent datastructure that stores tribles with set semantics.
 * It supports efficient set operations often take sub-linear time.
 */
export class TribleSet {
    EAV: typeof emptyEAVTriblePATCH;
    EVA: typeof emptyEVATriblePATCH;
    AEV: typeof emptyAEVTriblePATCH;
    AVE: typeof emptyAVETriblePATCH;
    VEA: typeof emptyVEATriblePATCH;
    VAE: typeof emptyVAETriblePATCH; 

  constructor(
    EAV = emptyEAVTriblePATCH,
    EVA = emptyEVATriblePATCH,
    AEV = emptyAEVTriblePATCH,
    AVE = emptyAVETriblePATCH,
    VEA = emptyVEATriblePATCH,
    VAE = emptyVAETriblePATCH,
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
  with(tribles: Iterable<Trible>) {
    const b = batch();

    const EAV = this.EAV;
    const EVA = this.EVA;
    const AEV = this.AEV;
    const AVE = this.AVE;
    const VEA = this.VEA;
    const VAE = this.VAE;

    for (const trible of tribles) {
      const entry: Entry<64, undefined> = new Entry(trible, undefined);

      EAV.put(b, entry);
      EVA.put(b, entry);
      AEV.put(b, entry);
      AVE.put(b, entry);
      VEA.put(b, entry);
      VAE.put(b, entry);
    }

    return new TribleSet(
      EAV,
      EVA,
      AEV,
      AVE,
      VEA,
      VAE,
    );
  }

  /**
   * Provides a way to dump all tribles this db in EAV lexicographic order.
   * @returns an array of tribles
   */
  tribles() {
    return this.EAV.infixes((k) => k);
  }

  /**
   * Returns a single trible constraint ensuring that there exists a corresponding
   * eav trible in this set for the passed e, a and v variables.
   */
  tripleConstraint(e: Variable<unknown>, a: Variable<unknown>, v: Variable<unknown>) {
    return new TribleConstraint(this, e, a, v);
  }

  /**
   * Returns a constraint ensuring that there is a corresponding trible in this
   * tribleset for each triple passed in the pattern.
   * This is equivalent to performing an `and`/conjunction over multiple tripleConstraint
   * calls, but allows for a potentially more efficient execution (see commits).
   */
  patternConstraint(triples: (readonly [Variable<unknown>, Variable<unknown>, Variable<unknown>])[]): Constraint {
    return and(
      ...triples.map(([e, a, v]) =>
        new TribleConstraint(this, e, a, v)
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
  isEqual(other: TribleSet): boolean {
    return this.EAV.isEqual(other.EAV);
  }
  /**
   * Checks if this tribleset is a subset of the passed tribleset,
   * i.e. if every trible of this set is also contained in the passed set.
   */
  /*
  isSubsetOf(other) {
    return this.EAV.isSubsetOf(other.indexE);
  }
  */

  /**
   * Checks if this tribleset has an intersection with the passed set,
   * i.e. if there exists a trible that is contained in both sets.
   */
  /*
  isIntersecting(other) {
    return this.EAV.isIntersecting(other.indexE);
  }
  */

  /**
   * Returns a new tribleset that is the union of this set and the passed set,
   * i.e. a set that contains any trible that is in either of the input sets.
   */
  union(other: TribleSet): TribleSet {
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
  /*
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
  */
  /**
   * Returns a new tribleset that contains the difference of this set and
   * the passed set, i.e. a set that contains any trible that is in one of
   * the sets but not in the other.
   */
  /*
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
  */
  /**
   * Returns a new tribleset that contains the intersection of this set and
   * the passed set, i.e. a set that contains any trible that is in both of
   * the sets.
   */
  /*
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
  */
}
