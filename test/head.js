import { assertRejects } from "https://deno.land/std@0.177.0/testing/asserts.ts";

import {
  BlobCache,
  FOTribleSet,
  Head,
  id,
  IDOwner,
  KB,
  NS,
  types,
  UFOID,
} from "../mod.js";

const { nameId, lovesId, titlesId, motherOfId, romeoId } = UFOID.namedCache();

Deno.test("unique constraint", async () => {
  const idOwner = new IDOwner(types.ufoid.factory);

  const knightsNS = new NS({
    [id]: { ...types.ufoid, factory: idOwner.factory() },
    name: { id: nameId, ...types.shortstring },
    loves: { id: lovesId, isLink: true },
    lovedBy: { id: lovesId, isLink: true, isInverse: true },
    titles: { id: titlesId, ...types.shortstring, isMany: true },
  });

  const head = new Head(
    new KB(new FOTribleSet(), new BlobCache()),
    knightsNS.validator(idOwner.validator()),
  );

  debugger;

  await head.commit((kb, commitID) =>
    kb.with(knightsNS, ([juliet]) => [
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
    ])
  );

  assertRejects(
    async () => {
      await head.commit((kb, commitID) =>
        kb.with(knightsNS, () => [{
          [id]: romeoId,
          name: "Bob",
        }])
      );
    },
    Error,
    "constraint violation: multiple values for unique attribute",
  );
});

Deno.test("unique inverse constraint", async () => {
  const idOwner = new IDOwner(types.ufoid.factory);
  const knightsNS = new NS({
    [id]: { ...types.ufoid, factory: idOwner.factory() },
    name: { id: nameId, ...types.shortstring },
    motherOf: { id: motherOfId, isLink: true, isMany: true },
    hasMother: { id: motherOfId, isLink: true, isInverse: true },
  });

  const head = new Head(
    new KB(new FOTribleSet(), new BlobCache()),
    knightsNS.validator(idOwner.validator()),
  );
  await head.commit((kb) =>
    kb.with(knightsNS, () => [
      {
        [id]: romeoId,
        name: "Romeo",
      },
      {
        name: "Lady Montague",
        motherOf: [romeoId],
      },
    ])
  );

  assertRejects(
    async () => {
      await head.commit((kb) =>
        kb.with(knightsNS, () => [
          {
            name: "Lady Impostor",
            motherOf: [romeoId],
          },
        ])
      );
    },
    Error,
    "constraint violation: multiple entities for unique attribute value",
  );
});
