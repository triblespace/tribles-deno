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
import { emptyTriblePART, emptyValuePART } from "../src/cuckoopart.js";

Deno.test("part insert", () => {
  const value = fc.array(fc.nat(255), { minLength: 32, maxLength: 32 }).map(
    (a) => new Uint8Array(a),
  );
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });

  fc.assert(
    fc.property(values, (vs) => {
      const part = vs.reduce((part, v) => part.put(v), emptyValuePART);

      const jsSet = new Set(vs.map((t) => encode(t)));
      const partSet = new Set([...part.keys()].map((t) => encode(t)));

      assertEquals(partSet, jsSet);
    }),
  );
});

Deno.test("part batch insert", () => {
  const value = fc.array(fc.nat(255), { minLength: 32, maxLength: 32 }).map(
    (a) => new Uint8Array(a),
  );
  const values = fc.set(value, { compare: equalValue, maxLength: 1000 });

  fc.assert(
    fc.property(values, (vs) => {
      const part = vs.reduce((part, v) => part.put(v), emptyValuePART.batch())
        .complete();

      const jsSet = new Set(vs.map((t) => encode(t)));
      const partSet = new Set([...part.keys()].map((t) => encode(t)));

      assertEquals(partSet, jsSet);
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
      const partA = vsA.reduce((part, v) => part.put(v), emptyValuePART);
      const partB = vsB.reduce((part, v) => part.put(v), emptyValuePART);

      assertEquals(
        partA.isEqual(partB),
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
      const partA = vsA.reduce((part, v) => part.put(v), emptyValuePART.batch())
        .complete();
      const partB = vsB.reduce((part, v) => part.put(v), emptyValuePART.batch())
        .complete();

      assertEquals(
        partA.isEqual(partB),
        isSetsEqual(new Set(vsA), new Set(vsB)),
      );
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

      const partA = vsA.reduce((part, v) => part.put(v), emptyValuePART);
      const partB = vsB.reduce((part, v) => part.put(v), emptyValuePART);

      const rawPartDifference = [...partA.subtract(partB).keys()];
      const partDifference = new Set(rawPartDifference
        .map((v) => encode(v)));

      assertEquals(rawPartDifference.length, jsDifference.size);
      assertEquals(partDifference, jsDifference);
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

      const partA = vsA.reduce(
        (part, trible) => part.put(trible),
        emptyValuePART,
      );
      const partB = vsB.reduce(
        (part, trible) => part.put(trible),
        emptyValuePART,
      );
      const rawPartUnion = [...partA.union(partB).keys()];
      const partUnion = new Set(rawPartUnion
        .map((v) => encode(v)));

      assertEquals(rawPartUnion.length, jsUnion.size);
      assertEquals(partUnion, jsUnion);
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

      const partA = vsA.reduce((part, v) => part.put(v), emptyValuePART);
      const partB = vsB.reduce((part, v) => part.put(v), emptyValuePART);

      const rawPartIntersection = [...partA.intersect(partB).keys()];
      const partIntersection = new Set(rawPartIntersection
        .map((v) => encode(v)));

      assertEquals(rawPartIntersection.length, jsIntersection.size);
      assertEquals(partIntersection, jsIntersection);
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

      const partA = vsA.reduce((part, v) => part.put(v), emptyValuePART);
      const partB = vsB.reduce((part, v) => part.put(v), emptyValuePART);

      const rawPartDifference = [...partA.difference(partB).keys()];
      const partDifference = new Set(rawPartDifference.map((v) => encode(v)));

      assertEquals(rawPartDifference.length, jsDifference.size);
      assertEquals(partDifference, jsDifference);
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

      const partA = vsA.reduce((part, v) => part.put(v), emptyValuePART);
      const partB = vsB.reduce((part, v) => part.put(v), emptyValuePART);

      const partIsSubsetOf = partA.isSubsetOf(partB);

      assertEquals(partIsSubsetOf, jsIsSubsetOf);
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

      const partA = vsA.reduce((part, v) => part.put(v), emptyValuePART);
      const partB = vsB.reduce((part, v) => part.put(v), emptyValuePART);

      const partIsIntersecting = partA.isIntersecting(partB);

      assertEquals(partIsIntersecting, jsIsIntersecting);
    }),
  );
});
