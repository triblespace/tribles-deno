import {
  assert,
  assertArrayIncludes,
  assertEquals,
} from "https://deno.land/std@0.78.0/testing/asserts.ts";
import { v4 } from "https://deno.land/std@0.78.0/uuid/mod.ts";

import { encode } from "https://deno.land/std@0.78.0/encoding/base64.ts";

import {
  ctx,
  id,
  MemBlobDB,
  MemTribleDB,
  S3BlobDB,
  TribleBox,
  TribleKB,
  types,
  UFOID,
  WSConnector,
} from "../mod.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.test({
  name: "Check loopback.",
  fn: async () => {
    // Define a context, mapping between js data and tribles.
    const { nameId, lovesId, titlesId } = UFOID.namedCache();

    const knightsCtx = ctx({
      ns: {
        [id]: { ...types.ufoid },
        name: { id: nameId, ...types.shortstring },
        loves: { id: lovesId },
        lovedBy: { id: lovesId, isInverse: true },
        titles: { id: titlesId, ...types.shortstring },
      },
      constraints: {
        [nameId]: { isUnique: true },
        [lovesId]: { isLink: true, isUnique: true },
        [titlesId]: {},
      },
    });
    // Add some data.

    const kb = new TribleKB(
      new MemTribleDB(),
      new S3BlobDB(
        {
          region: "local",
          accessKeyID: "jeanluc",
          secretKey: "teaearlgreyhot",
          endpointURL: "https://localhost:9000",
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
    wsCon.transfer().catch((e) => console.error(e.reasons));
    outbox.kb = knightskb;
    outbox.kb = knightskb2;

    let slept = 0;
    while (!inbox.kb.tribledb.equals(outbox.kb.tribledb) && slept < 1000) {
      await sleep(10);
      slept += 10;
    }
    await wsCon.disconnect();

    assertEquals(
      [...inbox.kb.tribledb.index[0].keys()].map((t) => encode(t)),
      [...outbox.kb.tribledb.index[0].keys()].map((t) => encode(t)),
    );
    assert(inbox.kb.tribledb.equals(outbox.kb.tribledb));
  },
  // https://github.com/denoland/deno/issues/7457
});
