import {
  assert,
  assertArrayIncludes,
  assertEquals,
} from "https://deno.land/std@0.78.0/testing/asserts.ts";
import fc from "https://cdn.skypack.dev/fast-check";
fc.configureGlobal(
  {
    numRuns: Number.MAX_SAFE_INTEGER,
    interruptAfterTimeLimit: (1000 * 5),
  },
);

import {
  decode,
  encode,
} from "https://deno.land/std@0.78.0/encoding/base64.ts";

import { equal, equalValue } from "../src/trible.js";
import { emptyTriblePACT, emptyValuePACT } from "../src/pact.js";

Deno.test("pact insert", () => {
  const value = fc.array(fc.nat(255), { minLength: 32, maxLength: 32 }).map(
    (a) => new Uint8Array(a),
  );
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });

  fc.assert(
    fc.property(values, (vs) => {
      const pact = vs.reduce((pact, v) => pact.put(v), emptyValuePACT);

      const jsSet = new Set(vs.map((t) => encode(t)));
      const pactSet = new Set([...pact.keys()].map((t) => encode(t)));

      assertEquals(pactSet, jsSet);
    }),
  );
});

Deno.test("pact batch insert", () => {
  const value = fc.array(fc.nat(255), { minLength: 32, maxLength: 32 }).map(
    (a) => new Uint8Array(a),
  );
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });

  fc.assert(
    fc.property(values, (vs) => {
      const pact = vs.reduce((pact, v) => pact.put(v), emptyValuePACT.batch())
        .complete();

      const jsSet = new Set(vs.map((t) => encode(t)));
      const pactSet = new Set([...pact.keys()].map((t) => encode(t)));

      assertEquals(pactSet, jsSet);
    }),
  );
});

Deno.test("pact multi batch insert", () => {
  const value = fc.array(fc.nat(255), { minLength: 32, maxLength: 32 }).map(
    (a) => new Uint8Array(a),
  );
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });

  fc.assert(
    fc.property(values, values, values, (vsA, vsB, vsC) => {
      const pactA = vsA.reduce((pact, v) => pact.put(v), emptyValuePACT.batch())
        .complete();

      const pactB = vsB.reduce((pact, v) => pact.put(v), pactA.batch())
        .complete();

      const pactC = vsC.reduce((pact, v) => pact.put(v), pactA.batch())
        .complete();

      const jsSet = new Set([
        ...vsA.map((t) => encode(t)),
        ...vsC.map((t) => encode(t)),
      ]);
      const pactSet = new Set([...pactC.keys()].map((t) => encode(t)));

      assertEquals(pactSet, jsSet);
    }),
  );
});

const isSetsEqual = (a, b) =>
  a.size === b.size && [...a].every((value) => b.has(value));

Deno.test("equality check", () => {
  const value = fc.array(fc.nat(255), { minLength: 32, maxLength: 32 }).map(
    (a) => new Uint8Array(a),
  );
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });
  const valueSets = values.chain((vs) =>
    fc.tuple(fc.subarray(vs), fc.subarray(vs))
  );

  fc.assert(
    fc.property(valueSets, ([vsA, vsB]) => {
      const pactA = vsA.reduce((pact, v) => pact.put(v), emptyValuePACT);
      const pactB = vsB.reduce((pact, v) => pact.put(v), emptyValuePACT);

      assertEquals(
        pactA.isEqual(pactB),
        isSetsEqual(new Set(vsA), new Set(vsB)),
      );
    }),
  );
});

Deno.test("equality check batched", () => {
  const value = fc.array(fc.nat(255), { minLength: 32, maxLength: 32 }).map(
    (a) => new Uint8Array(a),
  );
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });
  const valueSets = values.chain((vs) =>
    fc.tuple(fc.subarray(vs), fc.subarray(vs))
  );

  fc.assert(
    fc.property(valueSets, ([vsA, vsB]) => {
      const pactA = vsA.reduce((pact, v) => pact.put(v), emptyValuePACT.batch())
        .complete();
      const pactB = vsB.reduce((pact, v) => pact.put(v), emptyValuePACT.batch())
        .complete();

      assertEquals(
        pactA.isEqual(pactB),
        isSetsEqual(new Set(vsA), new Set(vsB)),
      );
    }),
  );
});

Deno.test("segment count", () => {
  const value = fc.uint8Array({ minLength: 32, maxLength: 32 });
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });

  fc.assert(
    fc.property(values, (vs) => {
      const pact = vs.reduce((pact, v) => pact.put(v), emptyValuePACT);

      const cursor = pact.segmentCursor().push();

      assertEquals(cursor.segmentCount(), vs.length);
    }),
  );
});

Deno.test("set subtract", () => {
  const value = fc.array(fc.nat(255), { minLength: 32, maxLength: 32 }).map(
    (a) => new Uint8Array(a),
  );
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });
  const valueSets = values.chain((vs) =>
    fc.tuple(fc.subarray(vs), fc.subarray(vs))
  );

  fc.assert(
    fc.property(valueSets, ([vsA, vsB]) => {
      const jsSetA = new Set(vsA.map((v) => encode(v)));
      const jsSetB = new Set(vsB.map((v) => encode(v)));
      const jsDifference = new Set([...jsSetA].filter((x) => !jsSetB.has(x)));

      const pactA = vsA.reduce((pact, v) => pact.put(v), emptyValuePACT);
      const pactB = vsB.reduce((pact, v) => pact.put(v), emptyValuePACT);

      const rawPactDifference = [...pactA.subtract(pactB).keys()];
      const pactDifference = new Set(rawPactDifference
        .map((v) => encode(v)));

      assertEquals(rawPactDifference.length, jsDifference.size);
      assertEquals(pactDifference, jsDifference);
    }),
  );
});

Deno.test("set union", () => {
  const value = fc.array(fc.nat(255), { minLength: 32, maxLength: 32 }).map(
    (a) => new Uint8Array(a),
  );
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });
  const valueSets = values.chain((vs) =>
    fc.tuple(fc.subarray(vs), fc.subarray(vs))
  );

  fc.assert(
    fc.property(valueSets, ([vsA, vsB]) => {
      const jsUnion = new Set(
        [...vsA.map((v) => encode(v)), ...vsB.map((v) => encode(v))],
      );

      const pactA = vsA.reduce(
        (pact, trible) => pact.put(trible),
        emptyValuePACT,
      );
      const pactB = vsB.reduce(
        (pact, trible) => pact.put(trible),
        emptyValuePACT,
      );
      const rawPactUnion = [...pactA.union(pactB).keys()];
      const pactUnion = new Set(rawPactUnion
        .map((v) => encode(v)));

      assertEquals(rawPactUnion.length, jsUnion.size);
      assertEquals(pactUnion, jsUnion);
    }),
  );
});

Deno.test("set intersection", () => {
  const value = fc.array(fc.nat(255), { minLength: 32, maxLength: 32 }).map(
    (a) => new Uint8Array(a),
  );
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });
  const valueSets = values.chain((vs) =>
    fc.tuple(fc.subarray(vs), fc.subarray(vs))
  );

  fc.assert(
    fc.property(valueSets, ([vsA, vsB]) => {
      const rSet = new Set(vsB.map((t) => encode(t)));
      const jsIntersection = new Set(
        vsA.map((v) => encode(v)).filter((v) => rSet.has(v)),
      );

      const pactA = vsA.reduce((pact, v) => pact.put(v), emptyValuePACT);
      const pactB = vsB.reduce((pact, v) => pact.put(v), emptyValuePACT);

      const rawPactIntersection = [...pactA.intersect(pactB).keys()];
      const pactIntersection = new Set(rawPactIntersection
        .map((v) => encode(v)));

      assertEquals(rawPactIntersection.length, jsIntersection.size);
      assertEquals(pactIntersection, jsIntersection);
    }),
  );
});

Deno.test("set symmetric difference", () => {
  const value = fc.array(fc.nat(255), { minLength: 32, maxLength: 32 }).map(
    (a) => new Uint8Array(a),
  );
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });
  const valueSets = values.chain((vs) =>
    fc.tuple(fc.subarray(vs), fc.subarray(vs))
  );

  fc.assert(
    fc.property(valueSets, ([vsA, vsB]) => {
      const jsSetA = new Set(vsA.map((t) => encode(t)));
      const jsSetB = new Set(vsB.map((t) => encode(t)));
      const jsDifference = new Set(
        [
          ...[...jsSetA].filter((v) => !jsSetB.has(v)),
          ...[...jsSetB].filter((v) => !jsSetA.has(v)),
        ],
      );

      const pactA = vsA.reduce((pact, v) => pact.put(v), emptyValuePACT);
      const pactB = vsB.reduce((pact, v) => pact.put(v), emptyValuePACT);

      const rawPactDifference = [...pactA.difference(pactB).keys()];
      const pactDifference = new Set(rawPactDifference.map((v) => encode(v)));

      assertEquals(rawPactDifference.length, jsDifference.size);
      assertEquals(pactDifference, jsDifference);
    }),
  );
});

Deno.test("set isSubsetOf", () => {
  const value = fc.array(fc.nat(255), { minLength: 32, maxLength: 32 }).map(
    (a) => new Uint8Array(a),
  );
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });
  const valueSets = values.chain((vs) =>
    fc.tuple(fc.subarray(vs), fc.subarray(vs))
  );

  fc.assert(
    fc.property(valueSets, ([vsA, vsB]) => {
      const jsSetA = new Set(vsA.map((t) => encode(t)));
      const jsSetB = new Set(vsB.map((t) => encode(t)));
      const jsIsSubsetOf = [...jsSetA].every((v) => jsSetB.has(v));

      const pactA = vsA.reduce((pact, v) => pact.put(v), emptyValuePACT);
      const pactB = vsB.reduce((pact, v) => pact.put(v), emptyValuePACT);

      const pactIsSubsetOf = pactA.isSubsetOf(pactB);

      assertEquals(pactIsSubsetOf, jsIsSubsetOf);
    }),
  );
});

Deno.test("set isIntersecting", () => {
  const value = fc.array(fc.nat(255), { minLength: 32, maxLength: 32 }).map(
    (a) => new Uint8Array(a),
  );
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });
  const valueSets = values.chain((vs) =>
    fc.tuple(fc.subarray(vs), fc.subarray(vs))
  );

  fc.assert(
    fc.property(valueSets, ([vsA, vsB]) => {
      const jsSetA = new Set(vsA.map((t) => encode(t)));
      const jsSetB = new Set(vsB.map((t) => encode(t)));
      const jsIsIntersecting = [...jsSetA].some((v) => jsSetB.has(v));

      const pactA = vsA.reduce((pact, v) => pact.put(v), emptyValuePACT);
      const pactB = vsB.reduce((pact, v) => pact.put(v), emptyValuePACT);

      const pactIsIntersecting = pactA.isIntersecting(pactB);

      assertEquals(pactIsIntersecting, jsIsIntersecting);
    }),
  );
});
