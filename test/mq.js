import {
  assert,
  assertArrayIncludes,
  assertEquals,
} from "https://deno.land/std@0.78.0/testing/asserts.ts";
import { v4 } from "https://deno.land/std@0.78.0/uuid/mod.ts";

import { encode } from "https://deno.land/std@0.78.0/encoding/base64.ts";

import {
  Box,
  globalInvariants,
  id,
  KB,
  MemBlobDB,
  MemTribleDB,
  namespace,
  S3BlobDB,
  types,
  UFOID,
  WSConnector,
} from "../mod.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const { nameId, lovesId, titlesId, motherOfId } = UFOID.namedCache();

globalInvariants({
  [nameId]: { isUnique: true },
  [lovesId]: { isLink: true, isUnique: true },
  [titlesId]: {},
});

globalInvariants({
  [nameId]: { isUnique: true },
  [motherOfId]: { isLink: true, isUniqueInverse: true },
});

Deno.test({
  name: "Check loopback.",
  fn: async () => {
    const knightsNS = namespace({
      [id]: { ...types.ufoid },
      name: { id: nameId, ...types.shortstring },
      loves: { id: lovesId },
      lovedBy: { id: lovesId, isInverse: true },
      titles: { id: titlesId, ...types.shortstring },
    });
    // Add some data.

    const kb = new KB(
      new MemTribleDB(),
      new S3BlobDB({
        region: "local",
        accessKeyID: "jeanluc",
        secretKey: "teaearlgreyhot",
        endpointURL: "https://localhost:9000",
        bucket: "denotest",
      })
    );

    const knightskb = kb.with(knightsNS, ([romeo, juliet]) => [
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
    ]);
    const knightskb2 = knightskb.with(knightsNS, ([william]) => [
      {
        [id]: william,
        name: "William",
        titles: ["author"],
      },
    ]);

    debugger;

    const inbox = new Box(kb);
    const outbox = new Box(kb);
    const wsCon = new WSConnector("ws://127.0.0.1:8816", inbox, outbox);
    await wsCon.connect();
    wsCon.transfer().catch((e) => console.error(e.reasons));
    outbox.set(knightskb);
    outbox.set(knightskb2);

    let slept = 0;
    while (
      !inbox.get().tribledb.isEqual(outbox.get().tribledb) &&
      slept < 1000
    ) {
      await sleep(10);
      slept += 10;
    }
    await wsCon.disconnect();

    assert(inbox.get().tribledb.isEqual(outbox.get().tribledb));
  },
  // https://github.com/denoland/deno/issues/7457
});
