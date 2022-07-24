import {
  assertThrows,
} from "https://deno.land/std@0.78.0/testing/asserts.ts";

import {
  BlobCache,
  Box,
  validateNS,
  id,
  KB,
  namespace,
  TribleSet,
  types,
  UFOID,
} from "../mod.js";

const { nameId, lovesId, titlesId, motherOfId, romeoId } = UFOID.namedCache();

Deno.test("unique constraint", () => {
  const knightsNS = namespace({
    [id]: { ...types.ufoid },
    name: { id: nameId, ...types.shortstring },
    loves: { id: lovesId, isLink: true },
    lovedBy: { id: lovesId, isLink: true, isInverse: true },
    titles: { id: titlesId, ...types.shortstring, isMany: true },
  });

  const box = new Box(new KB(new TribleSet(), new BlobCache()), validateNS(knightsNS));

  box.commit(kb => kb.with(knightsNS, ([juliet]) => [
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
      box.commit(kb => kb.with(knightsNS, () => [{
        [id]: romeoId,
        name: "Bob",
      }]));
    },
    Error,
    ""
  );
});

Deno.test("unique inverse constraint", () => {
  const knightsNS = namespace({
    [id]: { ...types.ufoid },
    name: { id: nameId, ...types.shortstring },
    motherOf: { id: motherOfId, isLink: true, isMany: true},
    hasMother: { id: motherOfId, isLink: true, isInverse:true },
  });

  const box = new Box(new KB(new TribleSet(), new BlobCache()), validateNS(knightsNS));
  box.commit(kb => kb.with(knightsNS, () => [
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
      box.commit(kb => kb.with(knightsNS, () => [
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
