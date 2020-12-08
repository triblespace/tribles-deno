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
import { defaultBlobDB } from "./blobdb.js";

const TRIBLES_PROTOCOL = "tribles";

// TODO add attribute based filtering.
class TribleMQ {
  constructor(
    inbox = emptykb,
    outbox = emptykb,
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

    const tribles = txn.subarray(TRIBLE_SIZE);
    const txnHash = blake2s32(tribles, new Uint8Array(32));
    if (!isValidTransaction(txnTrible, txnHash)) {
      console.warn("Bad transaction, hash does not match.");
      return;
    }

    const receivedTriblesBatch = emptyTriblePART.batch();
    for (const trible of contiguousTribles(tribles)) {
      receivedTriblesBatch.put(trible);
    }
    const receivedTribles = receivedTriblesBatch.complete();
    const novelTribles = receivedTribles.subtract(
      this._inbox.tribledb.index[EAV],
    );

    if (!novelTribles.isEmpty()) {
      const novel = emptykb.with(novelTribles.keys());

      const oldInbox = this._inbox;
      const nowInbox = this._inbox.withTribles(novelTribles.keys()); //TODO this could be a .union(change)

      this._inbox = nowInbox;
      this._changeWriter.write({
        inbox: {
          old: oldInbox,
          novel,
          now: nowInbox,
        },
        outbox: {
          old: this._outbox,
          novel: emptykb,
          now: this._outbox,
        },
      });
    }
  }

  _onOutTxn(txn) {
    this._txnCache = txn;
    for (const [addr, conn] of this._connections) {
      if (conn.readyState === WebSocket.OPEN) {
        conn.send(txn);
      }
    }
  }

  async connect(addr) {
    const websocket = new WebSocket(addr, TRIBLES_PROTOCOL);
    websocket.binaryType = "arraybuffer";
    const openPromise = new Promise((resolve, reject) => {
      websocket.addEventListener("open", (e) => {
        console.info(`Connected to ${addr}.`);
        const novelTriblesEager = [...this._outbox.tribledb.index[EAV].keys()];
        const triblesByteLength = TRIBLE_SIZE * novelTriblesEager.length;
        const transaction = new Uint8Array(TRIBLE_SIZE + triblesByteLength);
  
        let i = 1;
        for (const trible of novelTriblesEager) {
          transaction.set(trible, TRIBLE_SIZE * i++);
        }
        blake2s32(
          transaction.subarray(TRIBLE_SIZE),
          transaction.subarray(0, (TRIBLE_SIZE - VALUE_SIZE)),
        );
  
        websocket.send(transaction)
        this._connections.set(addr, websocket);
        resolve();
      });
      websocket.addEventListener("message", (e) => {
        self._onInTxn(e.data);
      });
      websocket.addEventListener("close", async (e) => {
        console.info(`Disconnected from ${addr}.`);
        this._connections.delete(addr, websocket);
        resolve();
      });
      websocket.addEventListener("error", (e) => {
        console.info(`Error on connection to ${addr}: ${e.message}`);
        reject();
      });
    });

    await openPromise;
    return this;
  }

  disconnect(addr) {
    this._connections.get(addr).close();

    return this;
  }

  disconnectAll() {
    for (const [addr, conn] of this._connections) {
      conn.close();
    }
    return this;
  }

  send(nowOutbox) {
    //TODO add size to PART, so this can be done lazily.
    console.log("Writing kb to outbox.");
    const novelTribles = nowOutbox.tribledb.index[EAV].subtract(
      this._outbox.tribledb.index[EAV],
    );
    if (!novelTribles.isEmpty()) {
      const novelTriblesEager = [...novelTribles.keys()];
      const triblesByteLength = TRIBLE_SIZE * novelTriblesEager.length;
      const transaction = new Uint8Array(TRIBLE_SIZE + triblesByteLength);

      let i = 1;
      for (const trible of novelTriblesEager) {
        transaction.set(trible, TRIBLE_SIZE * i++);
      }
      blake2s32(
        transaction.subarray(TRIBLE_SIZE),
        transaction.subarray(0, (TRIBLE_SIZE - VALUE_SIZE)),
      );

      this._onOutTxn(transaction);

      const novel = emptykb.withTribles(novelTribles.keys());

      const oldOutbox = this._outbox;
      this._outbox = nowOutbox;

      this._changeWriter.write({
        inbox: {
          old: this._inbox,
          novel: emptykb,
          now: this._inbox,
        },
        outbox: {
          old: oldOutbox,
          novel,
          now: nowOutbox,
        },
      });
    }

    return nowOutbox;
  }

  async *changes() {
    let readable;
    [this._changeReadable, readable] = this._changeReadable.tee();
    yield* readable.getIterator();
  }

  async *listen(ctx, query, blobdb = defaultBlobDB) {
    const transformer = {
      start(controller) {
        controller.enqueue(emptykb);
      },
      transform(changes, controller) {
        for (
          const result of find(ctx, (vars) => query(changes, vars), blobdb)
        ) {
          controller.enqueue(result);
        }
      },
    };
    let readable;
    [this._changeReadable, readable] = this._changeReadable.tee();

    const resultStream = new TransformStream(transformer);
    yield* readable.pipeThrough(resultStream).getIterator();
  }
}

/*
mq.listen(
  (change, v) => [
    change.inbox.novel.where({ name: v.name, titles: [v.title.at(0).descend()] }),
  ]
);
*/

export { TribleMQ };
