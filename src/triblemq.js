import { BufReader } from "https://deno.land/std@0.78.0/io/bufio.ts";

import { isTransactionMarker, isValidTransaction } from "./trible.js";
import { TribleKB } from "./triblekb.js";
import {
  blake2s32,
  blake2sFinal,
  blake2sInit,
  blake2sUpdate,
} from "./blake2s.js";
import { TRIBLE_SIZE, VALUE_SIZE } from "./trible.js";

const READ_BUFFER_SIZE = 1024; //TODO change in the future based on throughput/laterncy considerations.

async function sendTransactionTo(tribles, receivers) {
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

  return Promise.all(receivers.map((con) => con.write(transaction)));
}

class TribleMQ {
  constructor(
    queryAddr = { hostname: "localhost", port: 8816 },
    queryableAddr = { hostname: "localhost", port: 8816 },
    attrsOfInterest = null,
  ) {
    this.queryableAddr = queryableAddr;
    this.queryAddr = queryAddr;
    this.queryServer = null;
    this.queryingCons = [];
    this.queryCon = null;
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
    const listener = Deno.listen(
      { ...this.queryableAddr, transport: "tcp" },
    );

    (async () => {
      for await (const con of listener) {
        const tribles = [
          ...this._outbox.db.indices[0],
        ];
        this.queryingCons.push(con);
        if (0 < tribles.length) {
          sendTransactionTo(tribles, [con]);
        }
      }
    })();

    this.queryCon = await Deno.connect(
      { ...this.queryAddr, transport: "tcp" },
    );

    (async () => {
      let tmpInbox = this._inbox;
      let hashCtx = blake2sInit(32, null);
      const trible = new Uint8Array(32);
      const b = new BufReader(this.queryCon, READ_BUFFER_SIZE);
      while (true) {
        await b.readFull(trible);
        console.log("got trible!");
        if (isTransactionMarker(b)) {
          console.log("complete transaction!");
          const hash = blake2sFinal(hashCtx, new Uint8Array(32));
          if (isValidTransaction(b, hash)) {
            console.log("valid transaction!");
            this._inbox = tmpInbox;
          } else {
            console.warn("RECEIVED INVALID TRANSACTION!");
            tmpInbox = this._inbox;
          }
          hashCtx = blake2sInit(32, null);
        } else {
          blake2sUpdate(hashCtx, trible);
          tmpInbox = tmpInbox.withRaw([trible], []); //TODO: Do some benchmarks and check if we should do some batching here.
        }
      }
    })();

    return this;
  }

  async toOutbox(outbox_value) {
    const tribles = [
      ...this._outbox.db.indices[0].difference(outbox_value.db.indices[0]),
    ];
    if (0 < tribles.length) {
      await sendTransactionTo(tribles, this.queryingCons);
    }
    this._outbox = outbox_value;
    return outbox_value;
  }
}

export { TribleMQ };
