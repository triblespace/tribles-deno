import {
  assertArrayIncludes,
  assertEquals,
} from "https://deno.land/std@0.78.0/testing/asserts.ts";
import { v4 } from "https://deno.land/std@0.78.0/uuid/mod.ts";

import { id, TribleKB, TribleMQ, types } from "../mod.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.test("Check loopback.", async () => {
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

  const mq = new TribleMQ();
  await mq.run();
  await mq.toOutbox(knightskb);
  await sleep(1000);
  await mq.stop();

  //assertEquals(mq.inbox(), mq.outbox());
});
