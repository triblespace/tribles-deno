import {
  assert,
  assertArrayIncludes,
  assertEquals,
} from "https://deno.land/std@0.78.0/testing/asserts.ts";
import { v4 } from "https://deno.land/std@0.78.0/uuid/mod.ts";

import { encode } from "https://deno.land/std@0.78.0/encoding/base64.ts";

import {
  BlobCache,
  Box,
  id,
  KB,
  namespace,
  S3BlobCache,
  TribleSet,
  types,
  UFOID,
  WSConnector,
} from "../mod.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const { nameId, lovesId, titlesId, motherOfId } = UFOID.namedCache();

// cardinalityInvariants({
//   [nameId]: { isUnique: true },
//   [lovesId]: { isLink: true, isUnique: true },
//   [titlesId]: {},
// });

// cardinalityInvariants({
//   [nameId]: { isUnique: true },
//   [motherOfId]: { isLink: true, isUniqueInverse: true },
// });

Deno.test("unique constraint", () => {
  const knightsNS = namespace({
    [id]: { ...types.ufoid },
    name: { id: nameId, ...types.shortstring },
    loves: { id: lovesId },
    lovedBy: { id: lovesId, isInverse: true },
    titles: { id: titlesId, ...types.shortstring },
  });

  // Add some data.
  const memkb = new KB(new TribleSet(), new BlobCache());

  const knightskb = memkb.with(knightsNS, ([juliet]) => [
    {
      [id]: romeoId,
      name: "Romeo",
      titles: ["fool", "prince"],
      loves: juliet,
    },
    {
      [id]: romeoId,
      name: "Bob",
    },
    {
      [id]: juliet,
      name: "Juliet",
      titles: ["the lady", "princess"],
      loves: romeoId,
    },
  ]);
  assertThrows(
    () => {
      knightskb.with(knightsNS, () => [,]);
    },
    Error,
    ""
  );
});

Deno.test("unique inverse constraint", () => {
  const knightsNS = namespace({
    [id]: { ...types.ufoid },
    name: { id: nameId, ...types.shortstring },
    motherOf: { id: motherOfId },
  });

  // Add some data.
  const memkb = new KB(new TribleSet(), new BlobCache());

  const knightskb = memkb.with(knightsNS, () => [
    {
      [id]: romeoId,
      name: "Romeo",
    },
    {
      name: "Lady Montague",
      motherOf: [romeoId],
    },
  ]);
  assertThrows(
    () => {
      knightskb.with(knightsNS, () => [
        {
          name: "Lady Impostor",
          motherOf: [romeoId],
        },
      ]);
    },
    Error,
    ""
  );
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
      new TribleSet(),
      new S3BlobCache({
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

    const inbox = new Box();
    const outbox = new Box();
    const wsCon = new WSConnector("ws://127.0.0.1:8816", inbox, outbox);
    await wsCon.connect();
    wsCon.transfer().catch((e) => console.error(e.reasons));
    outbox.set(knightskb);
    outbox.set(knightskb2);

    let slept = 0;
    while (
      !inbox.get().tribleset.isEqual(outbox.get().tribleset) &&
      slept < 1000
    ) {
      await sleep(10);
      slept += 10;
    }
    await wsCon.disconnect();

    assert(inbox.get().tribleset.isEqual(outbox.get().tribleset));
  },
  // https://github.com/denoland/deno/issues/7457
});
