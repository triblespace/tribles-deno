import { entitiesToTriples } from "./kb.js";
import { Query, indexConstraint, IntersectionConstraint } from "./query.js";
import { emptyValuePACT } from "./pact.js";
import { UFOID } from "./types/ufoid.js";
import { Commit, validateCommitSize } from "./commit.js";


export function validateNS(ns) {
  const newUniqueAttributeIndex = emptyValuePACT.batch();
  const newUniqueInverseAttributeIndex = emptyValuePACT.batch();
  
  for (const {
    id: encodedId,
    isMulti,
    isInverse,
  } of ns.attributes.values()) {
    if (!isMulti) {
      if (isInverse) {
        newUniqueInverseAttributeIndex.put(encodedId);
      } else {
        newUniqueAttributeIndex.put(encodedId);
      }
    }
  }

  const uniqueAttributeIndex = newUniqueAttributeIndex.complete();
  const uniqueInverseAttributeIndex = newUniqueInverseAttributeIndex.complete();

  return (commit) => {
    for (const r of new Query(
      new IntersectionConstraint([
        indexConstraint(1, uniqueAttributeIndex),
        commit.commitKB.tribleset.constraint(0, 1, 2),
        commit.baseKB.tribleset.constraint(0, 1, 3),
      ])).run()) {
        if(!equalValue(r.get(2), r.get(3))) throw Error(
          `Constraint violation: Multiple values for unique attribute.`
        );
    }

    for (const r of new Query(
      new IntersectionConstraint([
        indexConstraint(1, uniqueInverseAttributeIndex),
        commit.commitKB.tribleset.constraint(2, 1, 0),
        commit.baseKB.tribleset.constraint(3, 1, 0),
      ])).run()) {
      if(!equalValue(r.get(2), r.get(3))) throw Error(
        `Constraint violation: Multiple entities for unique attribute value.`
      );
    }
  }
}

export class Box {
  constructor(initialKB, validationFn = validateCommitSize()) {
    this._kb = initialKB;
    this._validationFn = validationFn;
    this._subscriptions = new Set();
  }

  commit(fn) {
    const commitId = UFOID.now();
    const baseKB = this._kb;
    const currentKB = fn(baseKB, commitId);
    const commitKB = currentKB.subtract(baseKB);
    
    const commit = new Commit(baseKB, commitKB, currentKB, commitId);

    this._validationFn(commit);

    this._kb = currentKB;

    for (const sub of this._subscriptions) {
      sub(commit);
    }
  }

  peek() {
    return this._kb;
  }

  sub(fn) {
    this._subscriptions.add(fn);
  }

  unsub(fn) {
    this._subscriptions.remove(fn);
  }
}
