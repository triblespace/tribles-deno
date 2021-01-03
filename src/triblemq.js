const { emptyTriblePART } = require("./part.js");
const { isTransactionMarker, isValidTransaction } = require("./trible.js");
const { EAV } = require("./query.js");
const { find, TribleKB } = require("./triblekb.js");
const {
  blake2s32,
  blake2sFinal,
  blake2sInit,
  blake2sUpdate,
} = require("./blake2s.js");
const { contiguousTribles, TRIBLE_SIZE, VALUE_SIZE } = require("./trible.js");

const TRIBLES_PROTOCOL = "tribles";

function buildTransaction(kb) {
  // TODO This could be done lazily, with either a growable buffer
  // or by adding a size to parts.
  const novelTriblesEager = [...kb.tribledb.index[EAV].keys()];
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
    transaction.subarray((TRIBLE_SIZE - VALUE_SIZE), TRIBLE_SIZE),
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
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("close", reject, { once: true });
    });
    const closePromise = new Promise((resolve, reject) => {
      this.ws.addEventListener("close", resolve, { once: true });
      this.ws.addEventListener("close", reject, { once: true });
    });
    this.ws.openPromise = openPromise;
    this.ws.closePromise = closePromise;

    await openPromise;

    return this;
  }

  async transfer() {
    const changeIterator = this.outbox.changes();
    const closePromise = this.ws.closePromise.then(() => ({ close: true }));
    while (true) {
      const { change, close } = await Promise.race([
        changeIterator.next().then(({ value }) => ({ change: value })),
        closePromise,
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
      console.warn(
        `Bad transaction, doesn't begin with transaction marker.`,
      );
      return;
    }

    const txnTriblePayload = txn.subarray(TRIBLE_SIZE);
    const txnHash = blake2s32(txnTriblePayload, new Uint8Array(32));
    if (!isValidTransaction(txnTrible, txnHash)) {
      console.warn("Bad transaction, hash does not match.");
      return;
    }

    this.inbox.kb = this.inbox.kb.withTribles(
      contiguousTribles(txnTriblePayload),
    );
  }

  async disconnect() {
    this.ws.close();
    await this.ws.closePromise;
    return this;
  }
}

class TribleBox {
  constructor(
    kb,
  ) {
    this._kb = kb;

    const initChanges = {
      oldKB: kb.empty(),
      difKB: kb,
      newKB: kb,
    };

    let resolveNext;
    const nextPromise = new Promise((resolve) => resolveNext = resolve);
    this._resolveNext = resolveNext;
    this._changeNext = nextPromise;
    this._changeHead = Promise.resolve({
      next: nextPromise,
      value: initChanges,
    });
  }

  get kb() {
    return this._kb;
  }

  set kb(newKB) {
    //TODO add size to PART, so this can be done lazily.
    //TODO move this to set operations on tribledb
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
      const nextPromise = new Promise((resolve) => resolveNext = resolve);

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

  async *subscribe(ctx, query) {
    for await (
      const change of this.changes()
    ) {
      yield* find(
        ctx,
        (vars) => query(change, vars),
        change.newKB.blobdb,
      );
    }
  }
}

module.exports = { TribleBox, WSConnector };
