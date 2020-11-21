import {
  assertArrayIncludes,
  assertEquals,
} from "https://deno.land/std@0.78.0/testing/asserts.ts";
import { v4 } from "https://deno.land/std@0.78.0/uuid/mod.ts";

import { id, TribleKB, types } from "../mod.js";

Deno.test("Integration", () => {
  const observation_attr = v4.generate();
  const state_open = v4.generate();
  const state_done = v4.generate();

  // Define a context, mapping between js data and tribles.
  const todo_ctx = {
    [id]: { ...types.uuid, id: v4.generate() },
    observationOf: {
      isLink: true,
      id: observation_attr,
    },
    observedAs: {
      isInverseLink: true,
      id: observation_attr,
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
  const observation_id = v4.generate();
  let todos = new TribleKB().with(todo_ctx, ([t]) => [
    {
      task: "Get almondmilk!",
      observedAs: [
        {
          [id]: observation_id,
          state: state_open,
          stamp: { t: 0n, x: 0n, y: 0n, z: 0n },
        },
      ],
      createdBy: { name: "jp" },
    },
  ]);

  // Query some data.
  const [first_result] = todos.find(
    todo_ctx,
    ({ observation, stamp, task }) => [
      {
        [id]: observation.walk(), //Walk will create a proxy object which allows us to navigate the graph as a JS tree.
        stamp: stamp.at(0),
        observationOf: { task, createdBy: { name: "jp" } },
      },
    ],
  );

  assertEquals(first_result.observation.state[id], state_open); //Notice the walk() in action.
  assertEquals(first_result.task, "Get almondmilk!");
  assertEquals(first_result.stamp, { t: 0n, x: 0n, y: 0n, z: 0n });
});

Deno.test("Find Ascending", () => {
  // Define a context, mapping between js data and tribles.
  const knights_ctx = {
    [id]: { ...types.uuid },
    name: { id: v4.generate(), ...types.longstring },
    loves: { id: v4.generate(), isLink: true },
    titles: { id: v4.generate(), ...types.shortstring, isMany: true },
  };
  knights_ctx["lovedBy"] = { id: knights_ctx.loves.id, isInverseLink: true };
  // Add some data.
  let knightskb = new TribleKB().with(
    knights_ctx,
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
    ...knightskb.find(
      knights_ctx,
      ({ name, title }) => [{ name, titles: [title.at(0).ascend()] }],
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
  const knights_ctx = {
    [id]: { ...types.uuid },
    name: { id: v4.generate(), ...types.longstring },
    loves: { id: v4.generate(), isLink: true },
    titles: { id: v4.generate(), ...types.shortstring, isMany: true },
  };
  knights_ctx["lovedBy"] = { id: knights_ctx.loves.id, isInverseLink: true };
  // Add some data.
  let knightskb = new TribleKB().with(
    knights_ctx,
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
    ...knightskb.find(
      knights_ctx,
      ({ name, title }) => [{ name, titles: [title.at(0).descend()] }],
    ),
  ];
  assertEquals(results, [
    { name: "Juliet", title: "the lady" },
    { name: "Juliet", title: "princess" },
    { name: "Romeo", title: "prince" },
    { name: "Romeo", title: "idiot" },
  ]);
});
