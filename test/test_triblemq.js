import {
  assertArrayIncludes,
  assertEquals,
} from "https://deno.land/std@0.78.0/testing/asserts.ts";
import { v4 } from "https://deno.land/std@0.78.0/uuid/mod.ts";

import {
  id,
  MemTribleDB,
  S3BlobDB,
  TribleBox,
  TribleKB,
  types,
  WSConnector,
} from "../mod.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.test({
  name: "Check loopback.",
  fn: async () => {
    // Define a context, mapping between js data and tribles.
    const knightsCtx = {
      [id]: { ...types.uuid },
      name: { id: v4.generate(), ...types.longstring },
      loves: { id: v4.generate(), isLink: true },
      titles: { id: v4.generate(), ...types.shortstring, isMany: true },
    };
    knightsCtx["lovedBy"] = { id: knightsCtx.loves.id, isInverseLink: true };
    // Add some data.

    const kb = new TribleKB(
      new MemTribleDB(),
      new S3BlobDB(
        {
          region: "local",
          accessKeyID: "jeanluc",
          secretKey: "teaearlgreyhot",
          endpointURL: "http://127.0.0.1:9000",
          bucket: "denotest",
        },
      ),
    );

    const knightskb = kb.with(
      knightsCtx,
      (
        [romeo, juliet],
      ) => [
        {
          [id]: romeo,
          name: "Romeo",
          titles: ["fool", "prince"],
          loves: juliet,
        },
        {
          [id]: juliet,
          name: "Juliet",
          titles: ["the lady", "princess"],
          loves: romeo,
        },
      ],
    );
    const knightskb2 = knightskb.with(
      knightsCtx,
      (
        [william],
      ) => [
        {
          [id]: william,
          name: "William",
          titles: ["author"],
        },
      ],
    );

    const inbox = new TribleBox(kb);
    const outbox = new TribleBox(kb);
    const wsCon = new WSConnector("ws://127.0.0.1:8816", inbox, outbox);
    await wsCon.connect();
    inbox.kb = knightskb;
    inbox.kb = knightskb2;
    await sleep(1000);
    await wsCon.disconnect();
    //assertEquals(mq.inbox(), mq.outbox());

    /*
mq.listen(
  (change, v) => [
    change.inbox.new.where({ name: v.name, titles: [v.title.at(0).descend()] }),
  ]
);
    */
  },
  sanitizeOps: false,
  // TODO disable this workaround with the resolution of:
  // https://github.com/denoland/deno/issues/7457
});
