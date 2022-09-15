import { entitiesToTriples } from "./kb.js";
import { Query, indexConstraint, IntersectionConstraint } from "./query.js";
import { emptyValuePACT } from "./pact.js";
import { UFOID } from "./types/ufoid.js";
import { validateCommitSize } from "./commit.js";


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
        commit.difKB.tribleset.constraint(0, 1, 2),
        commit.oldKB.tribleset.constraint(0, 1, 3),
      ])).run()) {
        if(!equalValue(r.get(2), r.get(3))) throw Error(
          `Constraint violation: Multiple values for unique attribute.`
        );
    }

    for (const r of new Query(
      new IntersectionConstraint([
        indexConstraint(1, uniqueInverseAttributeIndex),
        commit.difKB.tribleset.constraint(2, 1, 0),
        commit.oldKB.tribleset.constraint(3, 1, 0),
      ])).run()) {
      if(!equalValue(r.get(2), r.get(3))) throw Error(
        `Constraint violation: Multiple entities for unique attribute value.`
      );
    }
  }
}

export class NoveltyConstraint {
  constructor(oldKB, newKB, triples) {

  }
}

export class Commit {
  constructor(oldKB, newKB, commitId) {
    this.oldKB = oldKB;
    this.newKB = newKB;
    this.difKB = newKB.subtract(oldKB);
    this.commitId = commitId;
  }

  where(ns, entities) {
    return (vars) => {
      const triples = entitiesToTriples(ns, () => vars.unnamed(), entities);
      const triplesWithVars = precompileTriples(ns, vars, triples);

      triplesWithVars.foreach(([e, a, v]) => {
        v.proposeBlobDB(newKB.blobdb);
      });
      return [
        ...triplesWithVars.map(([e, a, v]) =>
          newKB.tribleset.constraint(e.index, a.index, v.index)
        ),
        //new NoveltyConstraint(this.oldKB, this.newKB, triplesWithVars),
      ];
    };
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
    const oldKB = this._kb;
    const newKB = fn(oldKB, commitId);

    const commit = new Commit(oldKB, newKB, commitId);

    this._validationFn(commit, commitId);

    this._kb = newKB;

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
