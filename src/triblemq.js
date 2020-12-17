import { emptyTriblePART } from "./part.js";
import { isTransactionMarker, isValidTransaction } from "./trible.js";
import { EAV } from "./tribledb.js";
import { emptykb, find, TribleKB } from "./triblekb.js";
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

class QueryTransformer {
  constructor(mq, ctx, query) {
    this.mq = mq;
    this.ctx = ctx;
    this.query = query;
  }
  start(controller) {
    const initChanges = {
      oldInbox: emptykb,
      difInbox: this.mq._inbox,
      newInbox: this.mq._inbox,
      oldOutbox: emptykb,
      difOutbox: this.mq._outbox,
      newOutbox: this.mq._outbox,
    };
    for (
      const result of find(
        this.ctx,
        (vars) => this.query(initChanges, vars),
        this.mq.blobdb,
      )
    ) {
      controller.enqueue(result);
    }
  }
  transform(changes, controller) {
    for (
      const result of find(
        this.ctx,
        (vars) => this.query(changes, vars),
        this.mq.blobdb,
      )
    ) {
      controller.enqueue(result);
    }
  }
}

// TODO add attribute based filtering.
class TribleMQ {
  constructor(
    blobdb,
    inbox = new TribleKB(blobdb),
    outbox = new TribleKB(blobdb),
  ) {
    this._connections = new Map();
    this._inbox = inbox;
    this._outbox = outbox;
    this._changeStream = new TransformStream();
    this._changeWriter = this._changeStream.writable.getWriter();
    this._changeReadable = this._changeStream.readable;
  }

  _onInTxn(txn) {
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
    for (const trible of contiguousTribles(txnTriblePayload)) {
      receivedTriblesBatch.put(trible);
    }
    const receivedTribles = receivedTriblesBatch.complete();
    const novelTribles = receivedTribles.subtract(
      this._inbox.tribledb.index[EAV],
    );

    if (!novelTribles.isEmpty()) {
      const difInbox = emptykb.withTribles(novelTribles.keys());

      const oldInbox = this._inbox;
      const newInbox = this._inbox.withTribles(novelTribles.keys()); //TODO this could be a .union(change)

      this._inbox = newInbox;
      this._changeWriter.write({
        oldInbox,
        difInbox,
        newInbox,
        oldOutbox: this._outbox,
        difOutbox: emptykb,
        newOutbox: this._outbox,
      });
    }
  }

  _onOutTxn(txn) {
    for (const [addr, conn] of this._connections) {
      if (conn.readyState === WebSocket.OPEN) {
        conn.send(txn);
      }
    }
  }

  async connect(addr) {
    const websocket = new WebSocket(addr, TRIBLES_PROTOCOL);
    websocket.binaryType = "arraybuffer";
    websocket.addEventListener("open", (e) => {
      console.info(`Connected to ${addr}.`);

      const novelTribles = this._outbox.tribledb.index[EAV];
      if (!novelTribles.isEmpty()) {
        const transaction = buildTransaction(novelTribles);
        websocket.send(transaction);
      }
    });
    websocket.addEventListener("message", (e) => {
      this._onInTxn(new Uint8Array(e.data));
    });
    websocket.addEventListener("close", (e) => {
      console.info(`Disconnected from ${addr}.`);
      this._connections.delete(addr, websocket);
    });
    websocket.addEventListener("error", (e) => {
      console.error(`Error on connection to ${addr}: ${e.message}`);
    });
    const openPromise = new Promise((resolve, reject) => {
      websocket.addEventListener("open", resolve);
      websocket.addEventListener("close", reject);
    });
    const closePromise = new Promise((resolve, reject) => {
      websocket.addEventListener("close", resolve);
    });
    websocket.openPromise = openPromise;
    websocket.closePromise = closePromise;
    this._connections.set(addr, websocket);

    await openPromise;
    return addr;
  }

  async disconnect(addr) {
    const ws = this._connections.get(addr);
    ws.close();
    await ws.closePromise;
    return addr;
  }

  async disconnectAll() {
    const addrs = [...this._connections.values()];
    await Promise.all([...this._connections.values()].map((conn) => {
      conn.close();
      return conn.closePromise;
    }));
    return addrs;
  }

  send(newOutbox) {
    //TODO add size to PART, so this can be done lazily.
    const novelTribles = newOutbox.tribledb.index[EAV].subtract(
      this._outbox.tribledb.index[EAV],
    );
    if (!novelTribles.isEmpty()) {
      const transaction = buildTransaction(novelTribles);
      this._onOutTxn(transaction);

      const difOutbox = emptykb.withTribles(novelTribles.keys());

      const oldOutbox = this._outbox;
      this._outbox = newOutbox;

      this._changeWriter.write(
        {
          oldInbox: this._inbox,
          difInbox: emptykb,
          newInbox: this._inbox,
          oldOutbox,
          difOutbox,
          newOutbox,
        },
      );
    }

    return newOutbox;
  }

  async *changes() {
    let readable;
    [this._changeReadable, readable] = this._changeReadable.tee();
    yield* readable.getIterator();
  }

  async *listen(ctx, query) {
    let readable;
    [this._changeReadable, readable] = this._changeReadable.tee();

    const transformer = new QueryTransformer(this, ctx, query);
    const resultStream = new TransformStream(transformer);
    yield* readable.pipeThrough(resultStream).getIterator();
  }
}

export { TribleMQ };
