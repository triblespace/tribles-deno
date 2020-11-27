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
import { defaultBlobDB } from "./blobdb.js";

const READ_BUFFER_SIZE = 64; //TODO change in the future based on throughput/laterncy considerations.

class TribleMQ {
  constructor(
    ctx,
    conntectTo = [{ hostname: "localhost", port: 8816 }],
    listenOn = { hostname: "localhost", port: 8816 },
    blobdb = defaultBlobDB,
  ) {
    this.ctx = ctx;
    this.blobdb = blobdb;
    this.conntectTo = conntectTo;
    this.listenOn = listenOn;
    this.incomingQueryListener = null;
    this.incomingQueryListenerWorker = null;
    this.incomingQueryCons = new Set();
    this.incomingQueryWrites = new Set();
    this.queryCon = null;
    this.queryWorker = null;
    this._inbox = new TribleKB();
    this._outbox = new TribleKB();
    this.running = false;
  }

  inbox() {
    return this._inbox;
  }

  outbox() {
    return this._outbox;
  }

  async run() {
    console.log("running!");
    this.running = true;
    try {
      this.incomingQueryListener = Deno.listen(
        { ...this.queryableAddr, transport: "tcp" },
      );
      console.log("starting listener!");
      this.incomingQueryListenerWorker = this._runQueryListener();

      this.queryCon = await Deno.connect(
        { ...this.queryAddr, transport: "tcp" },
      );
      this.queryWorker = this._runQuery();
    } catch (error) {
      this.running = false;
      throw error;
    }
    return this;
  }

  async stop() {
    console.log("stopping!");
    this.running = false;
    this.incomingQueryListener.close();
    this.queryCon.close();
    this.incomingQueryCons.forEach((con) => con.close());
    await this.queryWorker;
    await Promise.all(this.incomingQueryWrites);

    return this;
  }

  async _runQuery() {
    try {
      console.log("running query!");
      const reader = new BufReader(this.queryCon, READ_BUFFER_SIZE);

      let tmpInbox = this._inbox;
      let hashCtx = blake2sInit(32, null);
      const trible = new Uint8Array(TRIBLE_SIZE);
      while (true) {
        const res = await reader.readFull(trible);

        if (res === null) {
          console.log("Other side closed query connection.");
          break;
        }
        console.log("got trible!");
        if (isTransactionMarker(trible)) {
          console.log("complete transaction!");
          const hash = blake2sFinal(hashCtx, new Uint8Array(32));
          if (isValidTransaction(trible, hash)) {
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
    } catch (error) {
      if (this.running) {
        console.log(error);
        //TODO: Add reconnect code?, and event handling.
      }
    }
  }

  async _runQueryListener() {
    console.log("Listener started!");
    for await (const con of this.incomingQueryListener) {
      this.incomingQueryCons.add(con);
      console.log("Incoming query!");
      const tribles = [
        ...this._outbox.tribledb.indices[0].keys(),
      ];
      if (0 < tribles.length) {
        this._sendTransaction(tribles, [con]);
      }
    }
  }

  async _sendTransaction(tribles) {
    console.log("Sending:", tribles.length);
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

    return Promise.all(
      Array.from(this.incomingQueryCons, (con) => {
        console.log(con);
        const write = con.write(transaction);
        this.incomingQueryWrites.add(write);
        return write.then((value) => {
          this.incomingQueryWrites.delete(write);
          return value;
        }, (reason) => {
          this.incomingQueryWrites.delete(write);
          return reason;
        });
      }),
    );
  }

  async emit(outboxValue) {
    const tribles = [
      ...this._outbox.tribledb.indices[0].difference(
        outboxValue.tribledb.indices[0],
      )
        .keys(),
    ];
    if (0 < tribles.length) {
      await this._sendTransaction(tribles);
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
    )
  }
}


mq.on(
  (change, v) => [
    change.txn.where({ name: v.name, titles: [v.title.at(0).descend()] }),
  ],
  (change, result) => console.log(result),
);

export { TribleMQ };
