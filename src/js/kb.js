import { FOTribleSet } from "./tribleset.js";
import { BlobCache } from "./blobcache.js";

const assert = (test, message) => {
  if (!test) {
    throw Error(message);
  }
};

class IDSequence {
  constructor(factory) {
    this.factory = factory;
  }

  [Symbol.iterator]() {
    return this;
  }
  next() {
    return { value: this.factory() };
  }
}

/** A persistent immutable knowledge base that stores tribles and blobs,
    providing a (JSON) tree based interface to access and create the graph within.*/
export class KB {
  /**
   * Create a knowledge base with the gives tribles and blobs.
   * @param {FOTribleSet} tribleset - The tribles stored.
   * @param {BlobCache} blobcache - The blobs associated with the tribles.
   */
  constructor(tribleset = new FOTribleSet(), blobcache = new BlobCache()) {
    this.tribleset = tribleset;
    this.blobcache = blobcache;
  }

  /**
   * Generates entities to be inserted into a KB.
   *
   * @callback entityGenerator
   * @param {IDSequence} ids
   * @yields {Object}
   */

  /**
   * Returns a collection of entities.
   *
   * @callback entityFunction
   * @param {IDSequence} ids
   * @returns {Array}
   */

  /**
   * Stores entities in the immutable KB, returning a new one while preserving the old one.
   * @param {Object} ctx - The context used for ids, attributes, and value encoding.
   * @param {entityFunction | entityGenerator} entities - A function/generator returning/yielding entities.
   * @returns {KB} A new KB with the entities added to it.
   */
  with(ns, entities) {
    const idFactory = ns.ids.factory;
    const createdEntities = entities(new IDSequence(idFactory));
    const triples = ns.entitiesToTriples(
      idFactory,
      createdEntities,
    );
    let newBlobCache = this.blobcache;
    const tribles = ns.triplesToTribles(triples, (key, blob) => {
      newBlobCache = newBlobCache.put(key, blob);
    });
    const newTribleSet = this.tribleset.with(tribles);
    return new KB(newTribleSet, newBlobCache);
  }

  /**
   * Stores tribles in the immutable KB, returning a new one while preserving the old one.
   * @param {Array} tribles - A function/generator returning/yielding entities.
   * @returns {KB} A new KB with the entities added to it.
   */
  withTribles(tribles) {
    const tribleset = this.tribleset.with(tribles);
    if (tribleset === this.tribleset) {
      return this;
    }
    return new KB(tribleset, this.blobcache);
  }

  /**
   * Creates a query constrained over the contents of this KB.
   * @param {Object} ctx - The context used for ids, attributes, and value encoding.
   * @param {Array} entities - A function/generator returning/yielding a pattern of entities to be matched.
   * @returns {Constraint} - A constraint that can be used in a `find` call.
   */
  where(ns, entities) {
    return (vars) => {
      const triples = ns.entitiesToTriples(
        () => vars.unnamed(),
        entities,
      );
      const triplesWithVars = ns.precompileTriples(vars, triples);
      for (const [_e, _a, v] of triplesWithVars) {
        v.proposeBlobCache(this.blobcache);
      }
      return this.tribleset.patternConstraint(
        triplesWithVars.map(([e, a, v]) => [e.index, a.index, v.index]),
      );
    };
  }

  /**
   * Creates proxy object to walk the graph stored in this KB.
   * @param {Object} ctx - The context used for ids, attributes, and value encoding.
   * @returns {Proxy} - A proxy emulating the graph of the KB.
   */
  walk(ns, eId) {
    return ns.entityProxy(this, eId);
  }

  /**
   * Returns an empty KB with the same type of tribleset and blobcache as this KB.
   * @returns {KB} - An empty KB.
   */
  empty() {
    return new KB(this.tribleset.empty(), this.blobcache.empty());
  }

  /**
   * Checks if this KB is empty (doesn't contain any tribles).
   * @returns {boolean}
   */
  isEmpty() {
    return this.tribleset.isEmpty();
  }

  /**
   * Checks if this KB contains the same tribles as the other KB.
   * @returns {boolean}
   */
  isEqual(other) {
    return this.tribleset.isEqual(other.tribleset);
  }

  /**
   * Checks if the tribles of KB are a subset of the tribles in the other KB.
   * @returns {boolean}
   */
  isSubsetOf(other) {
    return this.tribleset.isSubsetOf(other.tribleset);
  }

  /**
   * Checks if some trible exists in both in this KB and the other KB.
   * @returns {boolean}
   */
  isIntersecting(other) {
    return this.tribleset.isIntersecting(other.tribleset);
  }

  /**
   * Returns a new KB containing everything in this KB and the other KB.
   * @returns {KB}
   */
  union(other) {
    const tribleset = this.tribleset.union(other.tribleset);
    const blobcache = this.blobcache.union(other.blobcache);
    return new KB(tribleset, blobcache);
  }

  /**
   * Returns a new KB containing only things from this KB that were not in the other KB.
   * @returns {KB}
   */
  subtract(other) {
    const tribleset = this.tribleset.subtract(other.tribleset);
    const blobcache = this.blobcache.subtract(other.blobcache);
    return new KB(tribleset, blobcache);
  }

  /**
   * Returns a new KB containing only things not common to this KB and the other KB.
   * @returns {KB}
   */
  difference(other) {
    const tribleset = this.tribleset.difference(other.tribleset);
    const blobcache = this.blobcache.difference(other.blobcache);
    return new KB(tribleset, blobcache);
  }

  /**
   * Returns a new KB containing only things common to this KB and the other KB.
   * @returns {KB}
   */
  intersect(other) {
    const tribleset = this.tribleset.intersect(other.tribleset);
    const blobcache = this.blobcache.intersect(other.blobcache);
    return new KB(tribleset, blobcache);
  }
}
