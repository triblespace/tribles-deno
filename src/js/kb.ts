import { TribleSet } from "./tribleset.ts";
import { BlobCache } from "./blobcache.ts";
import { Variable } from "./query.ts";
import { Constraint } from "./constraints/constraint.ts";

/** A persistent immutable knowledge base that stores tribles and blobs,
    providing a (JSON) tree based interface to access and create the graph within.*/
export class KB {
  tribleset: TribleSet;
  blobcache: BlobCache;

  /**
   * Create a knowledge base with the gives tribles and blobs.
   * @param tribleset - The tribles stored.
   * @param blobcache - The blobs associated with the tribles.
   */
  constructor(tribleset: TribleSet = new TribleSet(), blobcache: BlobCache = new BlobCache()) {
    this.tribleset = tribleset;
    this.blobcache = blobcache;
  }

  /**
   * Creates a query constrained over the contents of this KB.
   * @param pattern - A function/generator returning/yielding a pattern of triples to be matched.
   * @returns - A constraint that can be used in a `find` call.
   */
  patternConstraint(pattern: [Variable<unknown>, Variable<unknown>, Variable<unknown>][]): Constraint {
    for (const [_e, _a, v] of pattern) {
      v.proposeBlobCache(this.blobcache);
    }
    return this.tribleset.patternConstraint(pattern);
  }

  /**
   * Returns an empty KB with the same type of tribleset and blobcache as this KB.
   * @returns - An empty KB.
   */
  empty(): KB {
    return new KB(this.tribleset.empty(), this.blobcache.empty());
  }

  /**
   * Checks if this KB is empty (doesn't contain any tribles).
   */
  isEmpty(): boolean {
    return this.tribleset.isEmpty();
  }

  /**
   * Checks if this KB contains the same tribles as the other KB. 
   */
  isEqual(other: KB) {
    return this.tribleset.isEqual(other.tribleset);
  }

  /**
   * Checks if the tribles of KB are a subset of the tribles in the other KB.
   */
  /*
  isSubsetOf(other: KB): boolean {
    return this.tribleset.isSubsetOf(other.tribleset);
  }
  */

  /**
   * Checks if some trible exists in both in this KB and the other KB.
   */
  /*
  isIntersecting(other: KB): boolean {
    return this.tribleset.isIntersecting(other.tribleset);
  }
  */

  /**
   * Returns a new KB containing everything in this KB and the other KB.
   */
  union(other: KB): KB {
    const tribleset = this.tribleset.union(other.tribleset);
    const blobcache = this.blobcache.union(other.blobcache);
    return new KB(tribleset, blobcache);
  }

  /**
   * Returns a new KB containing only things from this KB that were not in the other KB.
   */
  /*
  subtract(other: KB): KB {
    const tribleset = this.tribleset.subtract(other.tribleset);
    const blobcache = this.blobcache.subtract(other.blobcache);
    return new KB(tribleset, blobcache);
  }
  */

  /**
   * Returns a new KB containing only things not common to this KB and the other KB.
   */
  /*
  difference(other: KB): KB {
    const tribleset = this.tribleset.difference(other.tribleset);
    const blobcache = this.blobcache.difference(other.blobcache);
    return new KB(tribleset, blobcache);
  }
  */

  /**
   * Returns a new KB containing only things common to this KB and the other KB.
   */
  /*
  intersect(other: KB): KB {
    const tribleset = this.tribleset.intersect(other.tribleset);
    const blobcache = this.blobcache.intersect(other.blobcache);
    return new KB(tribleset, blobcache);
  }
  */
}
