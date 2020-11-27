import {
  assertArrayIncludes,
  assertEquals,
} from "https://deno.land/std@0.78.0/testing/asserts.ts";
import { v4 } from "https://deno.land/std@0.78.0/uuid/mod.ts";

import { find, id, TribleKB, types } from "../mod.js";

Deno.test("Integration", () => {
  const observationAttr = v4.generate();
  const stateOpen = v4.generate();
  //const stateDone = v4.generate();

  // Define a context, mapping between js data and tribles.
  const todoCtx = {
    [id]: { ...types.uuid, id: v4.generate() },
    observationOf: {
      isLink: true,
      id: observationAttr,
    },
    observedAs: {
      isInverseLink: true,
      id: observationAttr,
    },
    task: {
      ...types.shortstring,
      id: v4.generate(),
    },
    state: {
      isLink: true,
      id: v4.generate(),
    },
    stamp: {
      ...types.spacetimestamp,
      id: v4.generate(),
    },
    createdBy: {
      isLink: true,
      id: v4.generate(),
    },
    name: {
      ...types.shortstring,
      id: v4.generate(),
    },
  };
  const kb = new TribleKB();

  // Add some data.
  const observationId = v4.generate();
  const todos = new TribleKB().with(todoCtx, ([t]) => [
    {
      task: "Get almondmilk!",
      observedAs: [
        {
          [id]: observationId,
          state: stateOpen,
          stamp: { t: 0n, x: 0n, y: 0n, z: 0n },
        },
      ],
      createdBy: { name: "jp" },
    },
  ]);

  // Query some data.
  const [firstResult] = find(
    todoCtx,
    ({ observation, stamp, task }) => [todos.where(
      {
        [id]: observation.walk(todos), //Walk will create a proxy object which allows us to navigate the graph as a JS tree.
        stamp: stamp.at(0),
        observationOf: { task, createdBy: { name: "jp" } },
      },
    )],
  );

  assertEquals(firstResult.observation.state[id], stateOpen); //Notice the walk() in action.
  assertEquals(firstResult.task, "Get almondmilk!");
  assertEquals(firstResult.stamp, { t: 0n, x: 0n, y: 0n, z: 0n });
});

Deno.test("Find Ascending", () => {
  // Define a context, mapping between js data and tribles.
  const knightsCtx = {
    [id]: { ...types.uuid },
    name: { id: v4.generate(), ...types.longstring },
    loves: { id: v4.generate(), isLink: true },
    titles: { id: v4.generate(), ...types.shortstring, isMany: true },
  };
  knightsCtx["lovedBy"] = { id: knightsCtx.loves.id, isInverseLink: true };
  // Add some data.
  const knightskb = new TribleKB().with(
    knightsCtx,
    (
      [romeo, juliet],
    ) => [
      {
        [id]: romeo,
        name: "Romeo",
        titles: ["idiot", "prince"],
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
    ),
  ];
  assertEquals(results, [
    { name: "Romeo", title: "idiot" },
    { name: "Romeo", title: "prince" },
    { name: "Juliet", title: "princess" },
    { name: "Juliet", title: "the lady" },
  ]);
});

Deno.test("Find Descending", () => {
  // Define a context, mapping between js data and tribles.
  const knightsCtx = {
    [id]: { ...types.uuid },
    name: { id: v4.generate(), ...types.longstring },
    loves: { id: v4.generate(), isLink: true },
    titles: { id: v4.generate(), ...types.shortstring, isMany: true },
  };
  knightsCtx["lovedBy"] = { id: knightsCtx.loves.id, isInverseLink: true };
  // Add some data.
  const knightskb = new TribleKB().with(
    knightsCtx,
    (
      [romeo, juliet],
    ) => [
      {
        [id]: romeo,
        name: "Romeo",
        titles: ["idiot", "prince"],
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
    ),
  ];
  assertEquals(results, [
    { name: "Juliet", title: "the lady" },
    { name: "Juliet", title: "princess" },
    { name: "Romeo", title: "prince" },
    { name: "Romeo", title: "idiot" },
  ]);
});
