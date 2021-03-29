import {
  assertArrayIncludes,
  assertEquals,
} from "https://deno.land/std@0.78.0/testing/asserts.ts";
import { v4 } from "https://deno.land/std@0.78.0/uuid/mod.ts";

import {
  ctx,
  find,
  id,
  MemBlobDB,
  MemTribleDB,
  TribleKB,
  types,
  UFOID,
} from "../mod.js";

Deno.test("KB Find", () => {
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
    ids: {
      [nameId]: { isUnique: true },
      [lovesId]: { isLink: true, isUnique: true },
      [titlesId]: {},
    },
  });

  // Add some data.
  const memkb = new TribleKB(new MemTribleDB(), new MemBlobDB());

  const knightskb = memkb.with(
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

  // Query some data.
  const results = [
    ...knightskb.find(knightsCtx, (
      { name, title },
    ) => [{ name: name.at(0).ascend(), titles: [title] }]),
  ];
  assertEquals(results, [
    { name: "Juliet", title: "princess" },
    { name: "Juliet", title: "the lady" },
    { name: "Romeo", title: "fool" },
    { name: "Romeo", title: "prince" },
  ]);
});

Deno.test("Find Ascending", () => {
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
    ids: {
      [nameId]: { isUnique: true },
      [lovesId]: { isLink: true, isUnique: true },
      [titlesId]: {},
    },
  });

  // Add some data.
  const memkb = new TribleKB(new MemTribleDB(), new MemBlobDB());

  const knightskb = memkb.with(
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

  // Query some data.
  const results = [
    ...find(
      knightsCtx,
      (
        { name, title },
      ) => [knightskb.where({ name, titles: [title.at(0).ascend()] })],
      knightskb.blobdb,
    ),
  ];
  assertEquals(results, [
    { name: "Romeo", title: "fool" },
    { name: "Romeo", title: "prince" },
    { name: "Juliet", title: "princess" },
    { name: "Juliet", title: "the lady" },
  ]);
});

Deno.test("Find Descending", () => {
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
    ids: {
      [nameId]: { isUnique: true },
      [lovesId]: { isLink: true, isUnique: true },
      [titlesId]: {},
    },
  });

  // Add some data.
  const memkb = new TribleKB(new MemTribleDB(), new MemBlobDB());

  const knightskb = memkb.with(
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
  // Query some data.
  const results = [
    ...find(
      knightsCtx,
      (
        { name, title },
      ) => [knightskb.where({ name, titles: [title.at(0).descend()] })],
      knightskb.blobdb,
    ),
  ];
  assertEquals(results, [
    { name: "Juliet", title: "the lady" },
    { name: "Juliet", title: "princess" },
    { name: "Romeo", title: "prince" },
    { name: "Romeo", title: "fool" },
  ]);
});
