import { emptyTriblePART } from "./part.js";
import { isTransactionMarker, isValidTransaction } from "./trible.js";
import { EAV } from "./query.js";
import { MemTribleDB } from "./memtribledb.js";
import { find, TribleKB } from "./triblekb.js";
import {
  blake2s32,
  blake2sFinal,
  blake2sInit,
  blake2sUpdate,
} from "./blake2s.js";
import { contiguousTribles, TRIBLE_SIZE, VALUE_SIZE } from "./trible.js";

const TRIBLES_PROTOCOL = "tribles";

function buildTransaction(triblesPart) {
  const novelTriblesEager = [...triblesPart.keys()];
  const transaction = new Uint8Array(
    TRIBLE_SIZE * (novelTriblesEager.length + 1),
  );
  let i = 1;
  for (const trible of novelTriblesEager) {
    transaction.set(trible, TRIBLE_SIZE * i++);
  }
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
    this._worker = null;
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

    this._worker = this._work();

    return this;
  }

  async _work() {
    for await (const change of this.inbox.changes()) {
      const novelTribles = kb.tribledb.index[EAV];
      if (!novelTribles.isEmpty()) {
        const transaction = buildTransaction(novelTribles);
        await difKB.blobdb.flush();
        this.ws.send(transaction);
      }
    }
  }

  _onMessage(e) {
    const txn = new Uint8Array(e.data)
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

    const receivedTriblesBatch = emptyTriblePART.batch();
    for (const trible of) {
      receivedTriblesBatch.put(trible);
    }
    const receivedTribles = receivedTriblesBatch.complete();

    this.inbox.kb = this.inbox.kb.withTribles(contiguousTribles(txnTriblePayload))
  }

  async disconnect() {
    this.ws.close();
    await this.ws.closePromise;
    return this;
  }
}

class QueryTransformer {
  constructor(initKB, ctx, query) {
    this.initKB = initKB;
    this.ctx = ctx;
    this.query = query;
  }

  start(controller) {
    const initChanges = {
      oldKB: this.initKB.empty(),
      difKB: this.initKB,
      newKB: this.initKB,
    };
    for (
      const result of find(
        this.ctx,
        (vars) => this.query(initChanges, vars),
        this.initKB.blobdb,
      )
    ) {
      controller.enqueue(result);
    }
    this.initKB = null; // Free for GC.
  }

  transform(changes, controller) {
    for (
      const result of find(
        this.ctx,
        (vars) => this.query(changes, vars),
        changes.newKB.blobdb,
      )
    ) {
      controller.enqueue(result);
    }
  }
}

class TribleBox {
  constructor(
    kb,
  ) {
    this._kb = kb;
    this._changeStream = new TransformStream();
    this._changeWriter = this._changeStream.writable.getWriter();
    this._changeReadable = this._changeStream.readable;
  }

  get kb() {
    return this._kb;
  }

  set kb(newKB) {
    //TODO add size to PART, so this can be done lazily.
    //TODO move this to set operations on tribledb
    const novelTribles = newKB.tribledb.index[EAV].subtract(
      this._kb.tribledb.index[EAV],
    );
    if (!novelTribles.isEmpty()) {

      const difKB = new TribleKB(this._kb.tribledb.empty(), newKB.blobdb)
        .withTribles(novelTribles.keys());

      const oldKB = this._kb;
      this._kb = newKB;

      this._changeWriter.write(
        {
          oldKB,
          difKB,
          newKB,
        },
      );
    }
  }

  async *changes() {
    let readable;
    [this._changeReadable, readable] = this._changeReadable.tee();
    yield* readable.getIterator();
  }

  async *listen(ctx, query) {
    let readable;
    [this._changeReadable, readable] = this._changeReadable.tee();

    const transformer = new QueryTransformer(this._kb, ctx, query);
    const resultStream = new TransformStream(transformer);
    yield* readable.pipeThrough(resultStream).getIterator();
  }
}

export { TribleBox, WSConnector };
