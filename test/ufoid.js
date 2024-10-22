import {
  assert,
  assertArrayIncludes,
  assertEquals,
} from "https://deno.land/std@0.180.0/testing/asserts.ts";
import fc from "https://cdn.skypack.dev/fast-check";
fc.configureGlobal({
  numRuns: Number.MAX_SAFE_INTEGER,
  interruptAfterTimeLimit: 1000 * 5,
});

import { types, UFOID } from "../mod.js";

Deno.test("decoder->encoder roundtrip", () => {
  const value = fc
    .array(fc.nat(255), { minLength: 16, maxLength: 16 })
    .map(
      (a) =>
        new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...a]),
    );

  fc.assert(
    fc.property(value, (v) => {
      const encoded = types.ufoid.decoder(v);
      const vb = new Uint8Array(32);
      types.ufoid.encoder(encoded, vb);
      assertEquals(vb, v);
    }),
  );
});
