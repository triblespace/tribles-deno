import {
  emptyIdIdValueTriblePACT,
  emptyIdValueIdTriblePACT,
  emptyValueIdIdTriblePACT,
  PaddedCursor,
} from "./pact.js";
import {
  E_START,
  A_START,
  V_START,
  scrambleAEV,
  scrambleAVE,
  scrambleEAV,
  scrambleEVA,
  scrambleVAE,
  scrambleVEA,
} from "./trible.js";
import { UPPER, LOWER } from "./query";
import { and } from "./constraints/and.js";
import { setMetaId, setTrible, sign, verify } from "./wasm.js";

const BUFFER_SIZE = 64;

const stack_empty = 0;
const stack_e = 1;
const stack_a = 2;
const stack_v = 3;
const stack_ea = 4;
const stack_ev = 5;
const stack_ae = 6;
const stack_av = 7;
const stack_ve = 8;
const stack_va = 9;
const stack_eav = 10;
const stack_eva = 11;
const stack_aev = 12;
const stack_ave = 13;
const stack_vea = 14;
const stack_vae = 15;

export function deserialize(tribleset, bytes) {
  if (!commit_verify(bytes)) {
    throw Error("Failed to verify serialized tribleset!");
  }
  const pubkey = bytes.slice(16, 48);
  const metaId = bytes.slice(112, 128);

  const dataset = tribleset.with(
    splitTribles(bytes.subarray(commit_header_size)),
  );

  return { pubkey, metaId, dataset };
}

export function serialize(tribleset, metaId, secret) { // TODO replace this with WebCrypto Keypair once it supports ed25519.
  setMetaId(metaId);

  const tribles_count = tribleset.count();
  const tribles = tribleset.tribles();

  let i = 0;
  for (const trible of tribles) {
    setTrible(i, trible);
    i += 1;
  }

  return sign(secret, tribles_count);
}

/**
 * A constraint limits the passed variables e, a and v to values with
 * a corresponding eav trible existing in the passed tribleset.
 */
class TribleConstraint {
  constructor(tribleSet, e, a, v) {
    if (e === a || e === v || a == v) {
      throw new Error(
        "Triple variables must be uniqe. Use explicit equality when inner constraints are required.",
      );
    }

    this.state = stack_empty;
    this.eVar = e;
    this.aVar = a;
    this.vVar = v;
    this.eValue = new Uint8Array(16);
    this.aValue = new Uint8Array(16);
    this.vValue = new Uint8Array(32);
    this.tribleset = tribleset;
  }

  seek(value) {
    //TODO check value UPPER
    const key = new Uint8Array(64);
    switch (this.state) {
      case stack_empty:
        throw new error("unreachable");

      case stack_e:
        key.set(LOWER(value), 0);
        return this.eavCursor.seek(value);
      case stack_a:
        key.set(LOWER(value), 0);
        return this.aevCursor.seek(value);
      case stack_v:
        return this.veaCursor.seek(value);

      case stack_ea:
        return this.eavCursor.seek(value);
      case stack_ev:
        return this.evaCursor.seek(value);
      case stack_ae:
        return this.aevCursor.seek(value);
      case stack_av:
        return this.aveCursor.seek(value);
      case stack_ve:
        return this.veaCursor.seek(value);
      case stack_va:
        return this.vaeCursor.seek(value);

      case stack_eav:
        return this.eavCursor.seek(value);
      case stack_eva:
        return this.evaCursor.seek(value);
      case stack_aev:
        return this.aevCursor.seek(value);
      case stack_ave:
        return this.aveCursor.seek(value);
      case stack_vea:
        return this.veaCursor.seek(value);
      case stack_vae:
        return this.vaeCursor.seek(value);
    }
  }

  variables(bitset) {
    bitset.unsetAll();
    bitset.set(this.eVar);
    bitset.set(this.aVar);
    bitset.set(this.vVar);
  }

  blocked(bitset) {
    bitset.unsetAll();
  }

  pushVariable(variable) {
    if (this.eVar === variable) {
      switch (this.state) {
        case stack_empty:
          this.state = stack_e;
          return;

        case stack_a:
          this.state = stack_ae;
          return;
        case stack_v:
          this.state = stack_ve;
          return;

        case stack_av:
          this.state = stack_ave;
          return;
        case stack_va:
          this.state = stack_vae;
          return;

        default:
          throw new Error("unreachable");
      }
    }
    if (this.aVar === variable) {
      switch (this.state) {
        case stack_empty:
          this.state = stack_a;
          return;

        case stack_e:
          this.state = stack_ea;
          return;
        case stack_v:
          this.state = stack_va;
          return;

        case stack_ev:
          this.state = stack_eva;
          return;
        case stack_ve:
          this.state = stack_vea;
          return;

        default:
          throw new Error("unreachable");
      }
    }
    if (this.vVar == variable) {
      switch (this.state) {
        case stack_empty:
          this.state = stack_v;
          return;

        case stack_e:
          this.state = stack_ev;
          return;
        case stack_a:
          this.state = stack_av;
          return;

        case stack_ea:
          this.state = stack_eav;
          return;
        case stack_ae:
          this.state = stack_aev;
          return;

        default:
          throw new Error("unreachable");
          return;
      }
    }
  }

  popVariable() {
    switch (this.state) {
      case stack_empty:
        throw new Error("unreachable");

      case stack_e:
      case stack_a:
      case stack_v:
        this.state = stack_empty;
        return;

      case stack_ea:
      case stack_ev:
        this.state = stack_e;
        return;
      case stack_ae:
      case stack_av:
        this.state = stack_a;
        return;
      case stack_ve:
      case stack_va:
        this.state = stack_v;
        return;

      case stack_eav:
        this.state = stack_ea;
        return;
      case stack_eva:
        this.state = stack_ev;
        return;
      case stack_aev:
        this.state = stack_ae;
        return;
      case stack_ave:
        this.state = stack_av;
        return;
      case stack_vea:
        this.state = stack_ve;
        return;
      case stack_vae:
        this.state = stack_va;
        return;
    }
  }

  variableCosts(variable) {
    if (this.eVar === variable) {
      switch (this.state) {
        case stack_empty:
          return this.eavCursor.segmentCount();

        case stack_a:
          return this.aevCursor.segmentCount();
        case stack_v:
          return this.veaCursor.segmentCount();

        case stack_av:
          return this.aveCursor.segmentCount();
        case stack_va:
          return this.vaeCursor.segmentCount();

        default:
          throw new Error("unreachable");
      }
    }
    if (this.aVar === variable) {
      switch (this.state) {
        case stack_empty:
          return this.aevCursor.segmentCount();

        case stack_e:
          return this.eavCursor.segmentCount();
        case stack_v:
          return this.vaeCursor.segmentCount();

        case stack_ev:
          return this.evaCursor.segmentCount();
        case stack_ve:
          return this.veaCursor.segmentCount();

        default:
          throw new Error("unreachable");
      }
    }
    if (this.vVar === variable) {
      switch (this.state) {
        case stack_empty:
          return this.veaCursor.segmentCount();

        case stack_e:
          return this.evaCursor.segmentCount();
        case stack_a:
          return this.aveCursor.segmentCount();

        case stack_ea:
          return this.eavCursor.segmentCount();
        case stack_ae:
          return this.aevCursor.segmentCount();

        default:
          throw new Error("unreachable");
      }
    }
  }
}

/** A tribleset is an immutably persistent datastructure that stores tribles with set semantics.
 * It supports efficient set operations often take sub-linear time.
 */
export class TribleSet {
  constructor(
    EAV = emptyIdIdValueTriblePACT,
    EVA = emptyIdValueIdTriblePACT,
    AEV = emptyIdIdValueTriblePACT,
    AVE = emptyIdValueIdTriblePACT,
    VEA = emptyValueIdIdTriblePACT,
    VAE = emptyValueIdIdTriblePACT,
  ) {
    this.EAV = EAV;
    this.EVA = EVA;
    this.AEV = AEV;
    this.AVE = AVE;
    this.VEA = VEA;
    this.VAE = VAE;
  }

  /**
   * Returns a new tribleset containting both the tribles of this set
   * and the tribles passed in.
   */
  with(tribles) {
    const EAV = this.EAV.batch();
    const EVA = this.EVA.batch();
    const AEV = this.AEV.batch();
    const AVE = this.AVE.batch();
    const VEA = this.VEA.batch();
    const VAE = this.VAE.batch();

    for (const trible of tribles) {
      EAV.put(scrambleEAV(trible));
      EVA.put(scrambleEVA(trible));
      AEV.put(scrambleAEV(trible));
      AVE.put(scrambleAVE(trible));
      VEA.put(scrambleVEA(trible));
      VAE.put(scrambleVAE(trible));
    }

    return new TribleSet(
      EAV.complete(),
      EVA.complete(),
      AEV.complete(),
      AVE.complete(),
      VEA.complete(),
      VAE.complete(),
    );
  }

  /**
   * Provides a way to dump all tribles this db in EAV lexicographic order.
   * @returns an iterator of tribles
   */
  tribles() {
    return this.EAV.keys();
  }

  /**
   * Returns a single trible constraint ensuring that there exists a corresponding
   * eav trible in this set for the passed e, a and v variables.
   */
  tripleConstraint([e, a, v]) {
    return new TribleConstraint(this, e.index, a.index, v.index);
  }

  /**
   * Returns a constraint ensuring that there is a corresponding trible in this
   * tribleset for each triple passed in the pattern.
   * This is equivalent to performing an `and`/conjunction over multiple tripleConstraint
   * calls, but allows for a potentially more efficient execution (see commits).
   */
  patternConstraint(triples) {
    return and(
      ...triples.map(([e, a, v]) =>
        new TribleConstraint(this, e.index, a.index, v.index)
      ),
    );
  }

  /**
   * @returns The number of tribles stored in this set.
   */
  count() {
    return this.EAV.count();
  }

  /**
   * @returns A tribleset of the same type as this one with all contents removed.
   */
  empty() {
    return new TribleSet();
  }

  /**
   * @returns A bool indicating if this tribleset contains any tribles.
   */
  isEmpty() {
    return this.EAV.isEmpty();
  }

  /**
   * Compares two triblesets and returns wether they are equal.
   */
  isEqual(other) {
    return this.EAV.isEqual(other.EAV);
  }
  /**
   * Checks if this tribleset is a subset of the passed tribleset,
   * i.e. if every trible of this set is also contained in the passed set.
   */
  isSubsetOf(other) {
    return this.EAV.isSubsetOf(other.indexE);
  }

  /**
   * Checks if this tribleset has an intersection with the passed set,
   * i.e. if there exists a trible that is contained in both sets.
   */
  isIntersecting(other) {
    return this.EAV.isIntersecting(other.indexE);
  }

  /**
   * Returns a new tribleset that is the union of this set and the passed set,
   * i.e. a set that contains any trible that is in either of the input sets.
   */
  union(other) {
    return new TribleSet(
      this.EAV.union(other.EAV),
      this.EVA.union(other.EVA),
      this.AEV.union(other.AEV),
      this.AVE.union(other.AVE),
      this.VEA.union(other.VEA),
      this.VAE.union(other.VAE),
    );
  }

  /**
   * Returns a new tribleset that contains the tribles of this set
   * with the tribles of the passed set subtracted,
   * i.e. a set that contains any trible that is in this set but not in the passed set.
   */
  subtract(other) {
    return new TribleSet(
      this.EAV.subtract(other.EAV),
      this.EVA.subtract(other.EVA),
      this.AEV.subtract(other.AEV),
      this.AVE.subtract(other.AVE),
      this.VEA.subtract(other.VEA),
      this.VAE.subtract(other.VAE),
    );
  }

  /**
   * Returns a new tribleset that contains the difference of this set and
   * the passed set, i.e. a set that contains any trible that is in one of
   * the sets but not in the other.
   */
  difference(other) {
    return new TribleSet(
      this.EAV.difference(other.EAV),
      this.EVA.difference(other.EVA),
      this.AEV.difference(other.AEV),
      this.AVE.difference(other.AVE),
      this.VEA.difference(other.VEA),
      this.VAE.difference(other.VAE),
    );
  }

  /**
   * Returns a new tribleset that contains the intersection of this set and
   * the passed set, i.e. a set that contains any trible that is in both of
   * the sets.
   */
  intersect(other) {
    return new TribleSet(
      this.EAV.intersect(other.EAV),
      this.EVA.intersect(other.EVA),
      this.AEV.intersect(other.AEV),
      this.AVE.intersect(other.AVE),
      this.VEA.intersect(other.VEA),
      this.VAE.intersect(other.VAE),
    );
  }
}
