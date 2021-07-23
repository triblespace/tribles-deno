import { isTransactionMarker, isValidTransaction } from "./trible.js";
import { find } from "./kb.js";
import { blake2s32 } from "./blake2s.js";
import { contiguousTribles, TRIBLE_SIZE, VALUE_SIZE } from "./trible.js";

const TRIBLES_PROTOCOL = "tribles";

class WSConnector {
  constructor(addr, inbox, outbox) {
    this.addr = addr;
    this.ws = null;
    this.inbox = inbox;
    this.outbox = outbox;
  }
  async connect() {
    this.ws = new WebSocket(this.addr, TRIBLES_PROTOCOL);
    this.ws.binaryType = "arraybuffer";
    this.ws.addEventListener("open", (e) => {
      console.info(`Connected to ${this.addr}.`);
    });
    this.ws.addEventListener("message", (e) => {
      this._onMessage(e);
    });
    this.ws.addEventListener("close", (e) => {
      console.info(`Disconnected from ${this.addr}.`);
    });
    this.ws.addEventListener("error", (e) => {
      console.error(`Error on connection to ${this.addr}: ${e.message}`);
    });
    const openPromise = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve);
      this.ws.addEventListener("close", reject);
    });
    const closePromise = new Promise((resolve, reject) => {
      this.ws.addEventListener("close", resolve);
    });
    this.ws.openPromise = openPromise;
    this.ws.closePromise = closePromise;

    await openPromise;

    return this;
  }

  async transfer() {
    const changeIterator = this.outbox.changes();
    while (true) {
      const { change, close } = await Promise.race([
        changeIterator.next().then(({ value }) => ({ change: value })),
        this.ws.closePromise.then(() => ({ close: true })),
      ]);
      if (close) {
        return;
      }
      if (!change.difKB.isEmpty()) {
        const transaction = change.difKB.tribledb.dump();
        await change.difKB.blobdb.flush();
        this.ws.send(transaction);
      }
    }
  }

  _onMessage(e) {
    const txn = new Uint8Array(e.data);
    if (txn.length <= 64) {
      console.warn(`Bad transaction, too short.`);
      return;
    }
    if (txn.length % TRIBLE_SIZE !== 0) {
      console.warn(
        `Bad transaction, ${txn.length} is not a multiple of ${TRIBLE_SIZE}.`,
      );
      return;
    }
    const txnTrible = txn.subarray(0, TRIBLE_SIZE);
    if (!isTransactionMarker(txnTrible)) {
      console.warn(`Bad transaction, doesn't begin with transaction marker.`);
      return;
    }

    const txnTriblePayload = txn.subarray(TRIBLE_SIZE);
    const txnHash = blake2s32(txnTriblePayload, new Uint8Array(32));
    if (!isValidTransaction(txnTrible, txnHash)) {
      console.warn("Bad transaction, hash does not match.");
      return;
    }

    this.inbox.commit((kb) =>
      kb.withTribles(
        contiguousTribles(txnTriblePayload),
      )
    );
  }

  async disconnect() {
    this.ws.close();
    await this.ws.closePromise;
    return this;
  }
}

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
        this._subscriptions = this._subscriptions.filter((item) => item !== s),
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
      return {
        isStatic: false,
        constraintsSubscription: new Subscription((s, newKb, oldKb) => {
          triplesWithVars.map(([e, a, v]) =>
            (kb) => {
              v.proposeBlobDB(this.blobdb);
              return kb.tribledb.constraint(e.index, a.index, v.index);
            }
          );
        }, (s) => changeSubscription.unsubscribe()),
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
      this._onNotify && !this._snoozed &&
      (previousNotification !== notification)
    ) {
      this._onNotify(this, notification, this._pulledNotification);
    }
  }

  pull() {
    if (this._pulledNotification !== this._latestNotification) {
      this._pulledNotification = this._latestNotification;
      this._snoozed = false;
      return this._getNext(
        this,
        this._latestNotification,
        this._pulledNotification,
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
      constantConstraint(constantVariable.index, constantVariable.constant),
    );
  }

  const namedVariables = [...vars.namedVariables.values()];

  while (true) {
    const activeConstraints = Promise.race();

    const constraints = staticConstraints.slice();
    for (const dynamicConstraintGroup of dynamicConstraintGroups) {
      if (dynamicConstraintGroup.changes.head) {}
    }

    for (
      const r of resolve(
        constraints,
        new OrderByMinCostAndBlockage(vars.projected, vars.blockedBy),
        new Set(vars.variables.filter((v) => v.ascending).map((v) => v.index)),
        vars.variables.map((_) => new Uint8Array(VALUE_SIZE)),
      )
    ) {
      const result = {};
      for (
        const {
          index,
          isWalked,
          walkedKB,
          walkedNS,
          decoder,
          name,
          isOmit,
          blobdb,
        } of namedVariables
      ) {
        if (!isOmit) {
          const encoded = r[index];
          const decoded = decoder(
            encoded.slice(0),
            async () => await blobdb.get(encoded),
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

export { Box, search, WSConnector };
