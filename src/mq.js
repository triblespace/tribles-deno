import { isTransactionMarker, isValidTransaction } from "./trible.js";
import { find } from "./kb.js";
import { blake2s32 } from "./blake2s.js";
import { contiguousTribles, TRIBLE_SIZE, VALUE_SIZE } from "./trible.js";

const TRIBLES_PROTOCOL = "tribles";

function buildTransaction(kb) {
  // TODO This could be done lazily, with either a growable buffer
  // or by adding a total size to pacts.
  const novelTriblesEager = [...kb.tribledb.EAV.keys()];
  const transaction = new Uint8Array(
    TRIBLE_SIZE * (novelTriblesEager.length + 1),
  );
  let i = 1;
  for (const trible of novelTriblesEager) {
    transaction.set(trible, TRIBLE_SIZE * i++);
  }
  //TODO make hash configurable and use transaction trible attr for type
  blake2s32(
    transaction.subarray(TRIBLE_SIZE),
    transaction.subarray(TRIBLE_SIZE - VALUE_SIZE, TRIBLE_SIZE),
  );
  return transaction;
}

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
        const transaction = buildTransaction(change.difKB);
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

    const initChanges = {
      oldKB: kb.empty(),
      difKB: kb,
      newKB: kb,
    };

    let resolveNext;
    const nextPromise = new Promise((resolve) => (resolveNext = resolve));
    this._resolveNext = resolveNext;
    this._changeNext = nextPromise;
    this._changeHead = Promise.resolve({
      next: nextPromise,
      value: initChanges,
    });
  }

  commit(fn) {
    this.set(fn(this.get()));
  }

  get() {
    return this._kb;
  }

  set(newKB) {
    const difKB = newKB.subtract(this._kb);
    if (!difKB.isEmpty()) {
      const oldKB = this._kb;
      this._kb = newKB;

      const changes = {
        oldKB,
        difKB,
        newKB,
      };

      this._changeHead = this._changeNext;

      let resolveNext;
      const nextPromise = new Promise((resolve) => (resolveNext = resolve));

      this._resolveNext({
        next: nextPromise,
        value: changes,
      });

      this._resolveNext = resolveNext;
      this._changeNext = nextPromise;
    }
  }

  changes() {
    return {
      changeHead: this._changeHead,

      async next() {
        const { value, next } = await this.changeHead;
        this.changeHead = next;
        return { value };
      },

      [Symbol.asyncIterator]() {
        return this;
      },
    };
  }

  where(entities) {
    return (ns, vars) => {
      const triples = entitiesToTriples(ns, () => vars.unnamed(), entities);
      const triplesWithVars = precompileTriples(ns, vars, triples);
      return {
        isStatic: false,
        changes: this.changes(),
        constraints: triplesWithVars.map(([e, a, v]) =>
          (kb) => {
            v.proposeBlobDB(this.blobdb);
            return kb.tribledb.constraint(e.index, a.index, v.index);
          }
        ),
      };
    };
  }
}

async function* subscribe(ns, cfn) {
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
    Promise.race();

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

export { Box, subscribe, WSConnector };
