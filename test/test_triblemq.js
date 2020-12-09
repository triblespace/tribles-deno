import {
  assertArrayIncludes,
  assertEquals,
} from "https://deno.land/std@0.78.0/testing/asserts.ts";
import { v4 } from "https://deno.land/std@0.78.0/uuid/mod.ts";

import { id, TribleKB, TribleMQ, types } from "../mod.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.test({
  name: "Check loopback.",
  fn: async () => {
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

    const mq = new TribleMQ();
    await mq.connect("ws://127.0.0.1:8816");
    mq.send(knightskb);
    await sleep(10000);
    await mq.disconnectAll();
    //assertEquals(mq.inbox(), mq.outbox());
  },
  sanitizeOps: false,
  // TODO disable this workaround with the resolution of:
  // https://github.com/denoland/deno/issues/7457
});
