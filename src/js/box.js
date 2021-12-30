import {} from "./kb.js";
import { Query, indexConstraint, find } from "./query.js";

function validateInvariants(txn) {
  let prevE = null;
  let prevA = null;
  for (const r of new Query(
    3,
    [
      indexConstraint(0, touchedEntities),
      indexConstraint(1, touchedAttributes),
      indexConstraint(1, uniqueAttributeIndex),
      newTribleSet.constraint(0, 1, 2),
    ],
    new OrderByMinCostAndBlockage(3, new Set([0, 1, 2]), [
      [0, 2],
      [1, 2],
    ]),
    new Set([0, 1, 2])
  )) {
    if (
      prevE !== null &&
      prevA !== null &&
      equalValue(prevE, e) &&
      equalValue(prevA, a)
    ) {
      throw Error(
        `Constraint violation: Unique attribute '${ufoid.decoder(
          a,
          () => undefined
        )}' has multiple values on '${idDecoder(e, () => undefined)}'.`
      );
    }
    prevE = e.slice();
    prevA = a.slice();
  }

  prevA = null;
  let prevV = null;
  for (const [e, a, v] of resolve(
    [
      indexConstraint(2, touchedValues),
      indexConstraint(1, touchedAttributes),
      indexConstraint(1, uniqueInverseAttributeIndex),
      newTribleSet.constraint(0, 1, 2),
    ],
    new OrderByMinCostAndBlockage(3, new Set([0, 1, 2]), [
      [1, 0],
      [2, 0],
    ]),
    new Set([0, 1, 2]),
    [
      new Uint8Array(VALUE_SIZE),
      new Uint8Array(VALUE_SIZE),
      new Uint8Array(VALUE_SIZE),
    ]
  )) {
    if (
      prevA !== null &&
      prevV !== null &&
      equalValue(prevA, a) &&
      equalValue(prevV, v)
    ) {
      //TODO make errors pretty.
      throw Error(
        `Constraint violation: Unique inverse attribute '${ufoid.decoder(
          a,
          () => undefined
        )}' has multiple entities for '${v}'.`
      );
    }
    prevA = a.slice();
    prevV = v.slice();
  }
}

export class NoveltyConstraint {
  constructor(oldKB, newKB, triples) {}
}

export class Txn {
  constructor(oldKB, newKB) {
    this.oldKB = oldKB;
    this.newKB = newKB;
    this.difKB = newKB.subtract(oldKB);
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
        new NoveltyConstraint(this.oldKB, this.newKB, triplesWithVars),
      ];
    };
  }
}

export class Box {
  constructor(validationFn = validateInvariants) {
    this._kb = null;
    this._validationFn = validationFn;
    this._subscriptions = new Set();
  }

  commit(fn) {
    const oldKB = this._kb;
    const newKb = fn(oldKB);

    const txn = new Txn(oldKB, newKb);

    this._validationFn(newKb);

    this._kb = newKB;

    for (const sub of this._subscriptions) {
      sub(txn);
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
