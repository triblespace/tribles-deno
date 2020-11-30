import { AsyncWebSocket } from "./asyncwebsocket.ts";
import { isTransactionMarker, isValidTransaction } from "./trible.js";
import { TribleKB } from "./triblekb.js";
import {
  blake2s32,
  blake2sFinal,
  blake2sInit,
  blake2sUpdate,
} from "./blake2s.js";
import { TRIBLE_SIZE, VALUE_SIZE } from "./trible.js";
import { defaultBlobDB } from "./blobdb.js";

const TRIBLES_PROTOCOL = "tribles";

class TribleMQ {
  constructor(
    ctx,
    conntectTo = [],
    blobdb = defaultBlobDB,
  ) {
    this.ctx = ctx;
    this.blobdb = blobdb;
    this.conntectTo = conntectTo;
    // TODO This should probably be multiple in the future,
    // for now one is sufficient.
    this.websocket = null;
    this._inbox = new TribleKB();
    this._outbox = new TribleKB();
  }

  inbox() {
    return this._inbox;
  }

  outbox() {
    return this._outbox;
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
          let t = 0;
          const tribleIterator = {
            next() {
              if (t < tribleCount) {
                return {
                  value: tribles.subarray(t++ * TRIBLE_SIZE, t * TRIBLE_SIZE),
                };
              }
              return { done: true };
            },
            [Symbol.iterator]() {
              return this;
            },
          };
          const tmpInbox = this._inbox.withTribles(tribleIterator);
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

  send(outboxValue) {
    const tribles = [
      ...this._outbox.tribledb.indices[0].difference(
        outboxValue.tribledb.indices[0],
      )
        .keys(),
    ];
    if (0 < tribles.length) {
      const triblesByteLength = TRIBLE_SIZE * tribles.length;
      const transaction = new Uint8Array(triblesByteLength + TRIBLE_SIZE);
      tribles.forEach((t, i) => transaction.set(t, TRIBLE_SIZE * i));

      blake2s32(
        transaction.subarray(0, triblesByteLength),
        transaction.subarray(
          triblesByteLength + (TRIBLE_SIZE - VALUE_SIZE),
          triblesByteLength + TRIBLE_SIZE,
        ),
      );

      this.websocket.send(transaction);
    }
    this._outbox = outboxValue;
    return outboxValue;
  }

  *changes() {
    const txn = null;
    yield { oldKB: this._inbox, txn, newKB: this._inbox.union(txn) };
  }

  on(query, callback) {
    find(
      knightsCtx,
      (
        { name, title },
      ) => [knightskb.where({ name, titles: [title.at(0).descend()] })],
    );
  }
}

mq.on(
  (change, v) => [
    change.txn.where({ name: v.name, titles: [v.title.at(0).descend()] }),
  ],
  (change, result) => console.log(result),
);

export { TribleMQ };
