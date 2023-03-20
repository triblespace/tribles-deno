import { assertRejects } from "https://deno.land/std@0.180.0/testing/asserts.ts";

import { Head, id, IDOwner, KB, NS, types, UFOID } from "../mod.js";

const nameId = types.hex.factory();
const lovesId = types.hex.factory();
const titlesId = types.hex.factory();
const motherOfId = types.hex.factory();
const romeoId = types.hex.factory();

Deno.test("unique constraint", async () => {
  const idOwner = new IDOwner(types.hex);

  const knightsNS = new NS({
    [id]: { ...idOwner.type() },
    name: { id: nameId, ...types.shortstring },
    loves: { id: lovesId, isLink: true },
    lovedBy: { id: lovesId, isLink: true, isInverse: true },
    titles: { id: titlesId, ...types.shortstring, isMany: true },
  });

  const head = new Head(
    new KB(),
    knightsNS.validator(idOwner.validator()),
  );

  debugger;

  await head.commit((kb, commitID) =>
    kb.union(knightsNS.entities(([juliet]) => [
      {
        [id]: romeoId,
        name: "Romeo",
        titles: ["fool", "prince"],
        loves: juliet,
      },
      {
        [id]: juliet,
        name: "Juliet",
        titles: ["the lady", "princess"],
        loves: romeoId,
      },
    ]))
  );

  assertRejects(
    async () => {
      await head.commit((kb, commitID) =>
        kb.union(knightsNS.entities(() => [{
          [id]: romeoId,
          name: "Bob",
        }]))
      );
    },
    Error,
    "constraint violation: multiple values for unique attribute",
  );
});

Deno.test("unique inverse constraint", async () => {
  const idOwner = new IDOwner(types.hex);
  const knightsNS = new NS({
    [id]: { ...idOwner.type() },
    name: { id: nameId, ...types.shortstring },
    motherOf: { id: motherOfId, isLink: true, isMany: true },
    hasMother: { id: motherOfId, isLink: true, isInverse: true },
  });

  const head = new Head(
    new KB(),
    knightsNS.validator(idOwner.validator()),
  );
  await head.commit((kb) =>
    kb.union(knightsNS.entities(() => [
      {
        [id]: romeoId,
        name: "Romeo",
      },
      {
        name: "Lady Montague",
        motherOf: [romeoId],
      },
    ]))
  );

  assertRejects(
    async () => {
      await head.commit((kb) =>
        kb.union(knightsNS.entities(() => [
          {
            name: "Lady Impostor",
            motherOf: [romeoId],
          },
        ]))
      );
    },
    Error,
    "constraint violation: multiple entities for unique attribute value",
  );
});
