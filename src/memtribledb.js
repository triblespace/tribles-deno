import { EAV, INDEX_COUNT, indexOrder } from "./query.js";
import {
  A,
  E,
  emptyPART,
  emptyValuePART,
  equalId,
  V1,
  v1zero,
  V2,
} from "./part.js";

class MemTribleDB {
  constructor(index = {
    E = emptyPART,
    A = emptyPART,
    V1 = emptyPART,
    EA = emptyPART,
    EV = emptyPART,
    AV = emptyPART,
    EAV = emptyPART,
  }) {
    this.index = index;
  }

  with(tribles) {
    const index = { ...this.index };

    for (const trible of tribles) {
      const e = E(trible);
      const a = A(trible);
      const v1 = V1(trible);
      const v2 = V2(trible);

      index.E = index.E.put(
        e,
        (branch = { A: emptyPART, V1: emptyPART, AV: emptyPART }) => ({
          A: branch.A.put(
            a,
            ({ V1 = emptyPART }) => ({
              V1: V1.put(v1, ({ V2 = emptyPART }) => ({ V2: V2.put(v2) })),
            }),
          ),
          V1: branch.V1.put(
            v1,
            ({ V2 = emptyPART }) => ({
              V2: V2.put(v2, ({ A = emptyPART }) => ({ A: A.put(a) })),
            }),
          ),
        }),
      );

      index.A = index.A.put(
        a,
        (branch = { E: emptyPART, V1: emptyPART, EV: emptyPART }) => ({
          E: branch.E.put(
            e,
            ({ V1 = emptyPART }) => ({
              V1: V1.put(v1, ({ V2 = emptyPART }) => ({ V2: V2.put(v2) })),
            }),
          ),
          V1: branch.V1.put(
            v1,
            ({ V2 = emptyPART }) => ({
              V2: V2.put(v2, ({ E = emptyPART }) => ({ E: E.put(e) })),
            }),
          ),
        }),
      );

      index.V1 = index.V1.put(v1, ({ V2 = emptyPART }) => ({
        V2: V2.put(
          v2,
          (branch = { E: emptyPART, A: emptyPART, EA: emptyPART }) => ({
            E: branch.E.put(e, ({ A = emptyPART }) => ({ A: A.put(a) })),
            A: branch.A.put(a, ({ E = emptyPART }) => ({ E: E.put(e) })),
          }),
        ),
      }));

      const eIsA = equalId(e, a);
      const eIsV = v1zero(trible) && equalId(e, v2);
      const aIsV = v1zero(trible) && equalId(a, v2);

      index.EA = eIsA ? index.EA.put(e) : index.EA;
      index.EV = eIsV ? index.EV.put(e) : index.EV;
      index.AV = aIsV ? index.AV.put(a) : index.AV;
      index.EAV = eIsA && aIsV ? index.EAV.put(e) : index.EAV;
    }
    return new MemTribleDB(index);
  }

  empty() {
    return new MemTribleDB();
  }

  isEmpty() {
    return this.indexE.isEmpty();
  }

  isEqual(other) {
    return this.indexE.isEqual(other.indexE);
  }

  isSubsetOf(other) {
    return this.indexE.isSubsetWith(
      other.indexE,
      ({ A: thisA }, { A: otherA }) =>
        thisA.isSubsetWith(
          otherA,
          ({ V: thisV }, { V: otherV }) => thisV.isSubset(otherV),
        ),
    );
  }

  isIntersecting(other) {
    return this.indexE.isIntersectingWith(
      other.indexE,
      ({ A: thisA }, { A: otherA }) =>
        thisA.isIntersectingWith(
          otherA,
          ({ V: thisV }, { V: otherV }) => thisV.isIntersecting(otherV),
        ),
    );
  }

  union(other) {
    const indexE = this.indexE.unionWith(
      other.indexE,
      (
        { A: thisA, V: thisV, AV: thisAV },
        { A: otherA, V: otherV, AV: otherAV },
      ) => ({
        A: thisA.unionWith(otherA, (thisV, otherV) => thisV.union(otherV)),
        V: thisV.unionWith(otherV, (thisA, otherA) => thisA.union(otherA)),
        AV: thisAV.union(otherAV),
      }),
    );
    const indexA = this.indexA.unionWith(
      other.indexA,
      (
        { E: thisE, V: thisV, EV: thisEV },
        { E: otherE, V: otherV, EV: otherEV },
      ) => ({
        E: thisE.unionWith(otherE, (thisV, otherV) => thisV.union(otherV)),
        V: thisV.unionWith(otherV, (thisE, otherE) => thisE.union(otherE)),
        EV: thisEV.union(otherEV),
      }),
    );
    const indexV = this.indexV.unionWith(
      other.indexV,
      (
        { E: thisE, A: thisA, EA: thisEA },
        { E: otherE, A: otherA, EA: otherEA },
      ) => ({
        E: thisE.unionWith(otherE, (thisA, otherA) => thisA.union(otherA)),
        A: thisA.unionWith(otherA, (thisE, otherE) => thisE.union(otherE)),
        EA: thisEA.union(otherEA),
      }),
    );
    const indexEA = this.indexEA.unionWith(
      other.indexEA,
      ({ V: thisV }, { V: otherV }) => thisV.union(otherV),
    );
    const indexEV = this.indexEV.unionWith(
      other.indexEV,
      ({ A: thisA }, { A: otherA }) => thisA.union(otherA),
    );
    const indexAV = this.indexAV.unionWith(
      other.indexAV,
      ({ E: thisE }, { E: otherE }) => thisE.union(otherE),
    );
    const indexEAV = this.indexEAV.union(other.indexEAV);
    return new MemTribleDB(
      indexE,
      indexA,
      indexV,
      indexEA,
      indexEV,
      indexAV,
      indexEAV,
    );
  }

  subtract(other) {
    const index = new Array(INDEX_COUNT);
    for (let i = 0; i < INDEX_COUNT; i++) {
      index[i] = this.index[i].subtract(other.index[i]);
    }
    return new MemTribleDB(index);
  }

  difference(other) {
    const index = new Array(INDEX_COUNT);
    for (let i = 0; i < INDEX_COUNT; i++) {
      index[i] = this.index[i].difference(other.index[i]);
    }
    return new MemTribleDB(index);
  }

  intersect(other) {
    const index = new Array(INDEX_COUNT);
    for (let i = 0; i < INDEX_COUNT; i++) {
      index[i] = this.index[i].intersect(other.index[i]);
    }
    return new MemTribleDB(index);
  }
}

export { MemTribleDB };
