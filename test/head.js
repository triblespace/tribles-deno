import {
  assertThrows,
} from "https://deno.land/std@0.78.0/testing/asserts.ts";

import {
  BlobCache,
  Head,
  validateNS,
  id,
  KB,
  FOTribleSet,
  types,
  UFOID,
} from "../mod.js";

const { nameId, lovesId, titlesId, motherOfId, romeoId } = UFOID.namedCache();

Deno.test("unique constraint", () => {
  const knightsNS = {
    [id]: { ...types.ufoid },
    name: { id: nameId, ...types.shortstring },
    loves: { id: lovesId, isLink: true },
    lovedBy: { id: lovesId, isLink: true, isInverse: true },
    titles: { id: titlesId, ...types.shortstring, isMany: true },
  };

  const head = new Head(new KB(new FOTribleSet(), new BlobCache()), validateNS(knightsNS));

  head.commit((kb, commitID) => kb.with(knightsNS, ([juliet]) => [
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
  ]));

  assertThrows(
    () => {
      head.commit((kb, commitID) => kb.with(knightsNS, () => [{
        [id]: romeoId,
        name: "Bob",
      }]));
    },
    Error,
    ""
  );
});

Deno.test("unique inverse constraint", () => {
  const knightsNS = {
    [id]: { ...types.ufoid },
    name: { id: nameId, ...types.shortstring },
    motherOf: { id: motherOfId, isLink: true, isMany: true},
    hasMother: { id: motherOfId, isLink: true, isInverse:true },
  };

  const head = new Head(new KB(new FOTribleSet(), new BlobCache()), validateNS(knightsNS));
  head.commit(kb => kb.with(knightsNS, () => [
    {
      [id]: romeoId,
      name: "Romeo",
    },
    {
      name: "Lady Montague",
      motherOf: romeoId,
    },
  ]));

  assertThrows(
    () => {
      head.commit(kb => kb.with(knightsNS, () => [
        {
          name: "Lady Impostor",
          motherOf: [romeoId],
        },
      ]));
    },
    Error,
    ""
  );
});
