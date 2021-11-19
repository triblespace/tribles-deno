import { find } from "./kb.js";

// TODO Add constraint checking to box.
/*
if (newTribleSet !== this.tribleset) {
    let touchedEntities = emptyIdPACT.batch();
    for (const trible of tribles) {
      touchedEntities.put(E(trible));
    }
    touchedEntities = touchedEntities.complete();
    let touchedAttributes = emptyIdPACT.batch();
    for (const trible of tribles) {
      touchedAttributes.put(A(trible));
    }
    touchedAttributes = touchedAttributes.complete();
    let touchedValues = emptyValuePACT.batch();
    for (const trible of tribles) {
      touchedValues.put(V(trible));
    }
    touchedValues = touchedValues.complete();
  
    let prevE = null;
    let prevA = null;
    for (const [e, a] of resolve(
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
      new Set([0, 1, 2]),
      [
        new Uint8Array(VALUE_SIZE),
        new Uint8Array(VALUE_SIZE),
        new Uint8Array(VALUE_SIZE),
      ]
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
  }*/

class Box {
  constructor(kb) {
    this._kb = kb;
    this._subscriptions = [];
  }

  commit(fn) {
    this._kb = fn(this._kb);

    for (const subscription of this._subscriptions) {
      subscription.notify(this._kb);
    }
  }

  get() {
    return this._kb;
  }

  changes() {
    const s = new Subscription(
      (s, newKb, oldKb) => {
        const difKB = newKB.subtract(oldKB);
        return {
          oldKB,
          difKB,
          newKB,
        };
      },
      (s) =>
        (this._subscriptions = this._subscriptions.filter((item) => item !== s))
    );
    this._subscriptions.push(s);
    s.notify(this._kb);
    return s;
  }

  where(entities) {
    return (ns, vars) => {
      const triples = entitiesToTriples(ns, () => vars.unnamed(), entities);
      const triplesWithVars = precompileTriples(ns, vars, triples);
      const changeSubscription = this.changes();

      const constraintsSubscription = new Subscription(
        (s, newKb, oldKB) => {
          const { difKB, newKB } = changeSubscription.pull();
          triplesWithVars.foreach(([e, a, v]) => {
            v.proposeBlobDB(newKB.blobdb);
          });
          return {
            constraints: triplesWithVars.map(([e, a, v]) =>
              newKB.tribledb.constraint(e.index, a.index, v.index)
            ),
            oracles: triplesWithVars.map(([e, a, v]) =>
              difKB.tribledb.constraint(e.index, a.index, v.index)
            ),
          };
        },
        (s) => changeSubscription.unsubscribe()
      );

      changeSubscription.onNotify = (s, latest, pulled) => {
        constraintsSubscription.notify(latest);
      };

      return {
        isStatic: false,
        constraintsSubscription,
      };
    };
  }
}

//TODO add subscription map? does that layer another subscription? Does it only layer the getNext a la transducers?
// Do we clone the entire thing and replace the getNext, so that the original remains the same? Is a subscription mutable?
// We probably don't want to wrap entire subscription objects for mappings, but what about copying it for immutability?
// How would we make sure that both are notified, since only one of them is registered.
// This is an interesting question in general. If we wanted to use this to build a compute DAG, then we'd need this kind of immutability.
// How does observablehq runtime do it? How do observables in general do it?

class Subscription {
  constructor(getNext, onUnsubscribe, onNofity = undefined) {
    this._getNext = getNext;
    this._onUnsubscribe = onUnsubscribe;
    this._onNotify = onNofity;

    this._pulledNotification = undefined;
    this._latestNotification = undefined;

    this._snoozed = false;

    this.unsubscribed = false;
  }

  set onNotify(callback) {
    this._onNotify = callback;
    if (this._pulledNotification !== this._latestNotification) {
      callback(this, this._latestNotification, this._pulledNotification);
    }
  }

  notify(notification) {
    const previousNotification = this._latestNotification;
    this._latestNotification = notification;
    if (
      this._onNotify &&
      !this._snoozed &&
      previousNotification !== notification
    ) {
      this._onNotify(this, notification, this._pulledNotification);
    }
  }

  pull() {
    //TODO should the comparison be configurable? Do we want to use ordering, e.g. pulled < latest?
    if (this._pulledNotification !== this._latestNotification) {
      this._pulledNotification = this._latestNotification;
      this._snoozed = false;
      return this._getNext(
        this,
        this._latestNotification,
        this._pulledNotification
      );
    }
  }

  snooze() {
    this._snoozed = true;
  }

  unsubscribe() {
    if (!this.unsubscribed) {
      this.unsubscribed = true;
      this._onUnsubscribe(this);
    }
  }
}

async function* search(ns, cfn) {
  const vars = new VariableProvider();
  const staticConstraints = [];
  const dynamicConstraintGroups = [];
  for (const constraintBuilder of cfn(vars.namedCache())) {
    const constraintGroup = constraintBuilder(ns, vars);
    if (constraintGroup.isStatic) {
      for (const constraint of constraintGroup.constraints) {
        staticConstraints.push(constraint);
      }
    } else {
      dynamicConstraintGroups.push(constraintGroup);
    }
  }

  for (const constantVariable of vars.constantVariables.values()) {
    staticConstraints.push(
      constantConstraint(constantVariable.index, constantVariable.constant)
    );
  }

  const namedVariables = [...vars.namedVariables.values()];

  while (true) {
    const activeConstraints = Promise.race();

    const constraints = staticConstraints.slice();
    for (const dynamicConstraintGroup of dynamicConstraintGroups) {
      if (dynamicConstraintGroup.changes.head) {
      }
    }

    for (const r of resolve(
      constraints,
      new OrderByMinCostAndBlockage(vars.projected, vars.isBlocking),
      new Set(vars.variables.filter((v) => v.ascending).map((v) => v.index)),
      vars.variables.map((_) => new Uint8Array(VALUE_SIZE))
    )) {
      const result = {};
      for (const {
        index,
        isWalked,
        walkedKB,
        walkedNS,
        decoder,
        name,
        isOmit,
        blobcache,
      } of namedVariables) {
        if (!isOmit) {
          const encoded = r[index];
          const decoded = decoder(
            encoded.slice(0),
            async () => await blobcache.get(encoded)
          );
          result[name] = isWalked
            ? walkedKB.walk(walkedNS || ns, decoded)
            : decoded;
        }
      }
      yield result;
    }
  }
}

export { Box, search };
