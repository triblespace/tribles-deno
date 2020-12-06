import { AsyncWebSocket } from "./asyncwebsocket.ts";
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
    conntectTo = "127.0.0.1:8816",
  ) {
    this.conntectTo = conntectTo;
    // TODO This should probably be multiple in the future,
    // for now one is sufficient.
    this.websocket = null;
    this._inbox = new TribleKB();
    this._outbox = new TribleKB();
    this._changeStream = new TransformStream();
    this._changeWriter = this._changeStream.writable.getWriter();
    this._changeReadable = this._changeStream.readable;
  }

  async run() {
    this.websocket = new AsyncWebSocket(this.conntectTo, TRIBLES_PROTOCOL);
    for await (const msg of this.websocket) {
      switch (msg.type) {
        case "message": {
          if (msg.data.length <= 64) {
            console.warn(`Bad transaction, too short.`);
            break;
          }
          if (msg.data.length % TRIBLE_SIZE !== 0) {
            console.warn(
              `Bad transaction, ${msg.data.length} is not a multiple of ${TRIBLE_SIZE}.`,
            );
            break;
          }
          const tribleCount = (msg.data.length / TRIBLE_SIZE) - 1;
          const txnTrible = new Uint8Array(
            msg.data,
            tribleCount * TRIBLE_SIZE,
            TRIBLE_SIZE,
          );
          if (!isTransactionMarker(txnTrible)) {
            console.warn(
              `Bad transaction, no valid transaction marker at end.`,
            );
            break;
          }

          const tribles = new Uint8Array(
            msg.data,
            0,
            tribleCount * TRIBLE_SIZE,
          );
          const txnHash = blake2s32(tribles, new Uint8Array(32));
          if (!isValidTransaction(txnTrible, txnHash)) {
            console.warn("Bad transaction, hash does not match.");
            break;
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
          break;
        }
      }
    }

    return this;
  }

  stop() {
    this.websocket.close();
    return this;
  }

  send(nowOutbox) {
    const novelTribles = nowOutbox.tribledb.index[EAV].subtract(
      this._outbox.tribledb.index[EAV],
    );
    if (!novelTribles.isEmpty()) {
      const triblesByteLength = TRIBLE_SIZE * novelTribles.length;
      const transaction = new Uint8Array(triblesByteLength + TRIBLE_SIZE);
      novelTribles.keys().forEach((t, i) =>
        transaction.set(t, TRIBLE_SIZE * i)
      );

      blake2s32(
        transaction.subarray(0, triblesByteLength),
        transaction.subarray(
          triblesByteLength + (TRIBLE_SIZE - VALUE_SIZE),
          triblesByteLength + TRIBLE_SIZE,
        ),
      );

      this.websocket.send(transaction);

      const novel = emptykb.with(novelTribles.keys());

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
