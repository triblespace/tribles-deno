import {
  assertArrayIncludes,
  assertEquals,
} from "https://deno.land/std@0.78.0/testing/asserts.ts";
import { v4 } from "https://deno.land/std@0.76.0/uuid/mod.ts";
import {
  decode,
  encode,
} from "https://deno.land/std@0.78.0/encoding/base64.ts";

import fc from "https://cdn.skypack.dev/fast-check";
fc.configureGlobal(
  {
    numRuns: Number.MAX_SAFE_INTEGER,
    interruptAfterTimeLimit: (1000 * 5),
  },
);

import { equal } from "../src/trible.js";
import { TRIBLE_PART, VALUE_PART } from "../src/part.js";

Deno.test("TRIBLE_PART set difference no heritage", () => {
  const trible = fc.array(fc.nat(255), { minLength: 64, maxLength: 64 }).map(
    (a) => new Uint8Array(a),
  );
  const tribles = fc.set(trible, { compare: equal, maxLength: 10000 });
  const tribleSets = tribles.chain((ts) =>
    fc.tuple(fc.subarray(ts), fc.subarray(ts))
  );

  fc.assert(
    fc.property(tribleSets, ([l, r]) => {
      const ls = new Set(l.map((t) => encode(t)));
      const rs = new Set(r.map((t) => encode(t)));
      const diffs = new Set([...ls].filter((x) => !rs.has(x)));

      const lp = l.reduce((part, trible) => part.put(trible), TRIBLE_PART);
      const rp = r.reduce((part, trible) => part.put(trible), TRIBLE_PART);
      const diffp = [...lp.difference(rp).keys()];

      const diff = new Set(diffp.map((t) => encode(t)));

      assertEquals(diffp.length, diffs.size);
      assertEquals(diff, diffs);
    }),
  );
});

Deno.test("TRIBLE_PART set difference with heritage", () => {
  const trible = fc.array(fc.nat(255), { minLength: 64, maxLength: 64 }).map(
    (a) => new Uint8Array(a),
  );
  const tribles = fc.set(trible, { compare: equal, maxLength: 100 });
  const batches = fc.array(tribles, { maxLength: 100 });

  fc.assert(
    fc.property(batches, batches, batches, (base, l, r) => {
      const ls = new Set(l.flatMap((ts) => ts.map((t) => encode(t))));
      const rs = new Set(r.flatMap((ts) => ts.map((t) => encode(t))));
      const diffs = new Set([...ls].filter((x) => !rs.has(x)));

      const bp = base.reduce(
        (part, trible_batch) =>
          trible_batch.reduce(
            (bpart, trible) => bpart.put(trible),
            part.batch(),
          ).complete(),
        TRIBLE_PART,
      );
      const lp = l.reduce(
        (part, trible_batch) =>
          trible_batch.reduce(
            (bpart, trible) => bpart.put(trible),
            part.batch(),
          ).complete(),
        bp,
      );
      const rp = r.reduce(
        (part, trible_batch) =>
          trible_batch.reduce(
            (bpart, trible) => bpart.put(trible),
            part.batch(),
          ).complete(),
        bp,
      );
      const diffp = [...lp.difference(rp).keys()];

      const diff = new Set(diffp.map((t) => encode(t)));

      assertEquals(diffp.length, diffs.size);
      assertEquals(diff, diffs);
    }),
  );
});
