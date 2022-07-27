import {
  emptyIdIdValueTriblePACT,
  emptyIdValueIdTriblePACT,
  emptyValueIdIdTriblePACT,
  PaddedCursor
} from "./pact.js";
import {
  scrambleAEV,
  scrambleAVE,
  scrambleEAV,
  scrambleEVA,
  scrambleVAE,
  scrambleVEA,
} from "./trible.js";
import {
  IntersectionConstraint,
} from "./query.js";

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

class MemTribleConstraint {
  constructor(tribleSet, e, a, v) {
    if (e === a || e === v || a == v) {
      throw new Error('Triple variables must be uniqe. Use explicit equality when inner constraints are required.')
    }

    this.state = stack_empty;
    this.eVar = e;
    this.aVar = a;
    this.vVar = v;
    this.eavCursor = new PaddedCursor(tribleSet.EAV.cursor(), tribleSet.EAV.constructor.segments, 32);
    this.evaCursor = new PaddedCursor(tribleSet.EVA.cursor(), tribleSet.EVA.constructor.segments, 32);
    this.aevCursor = new PaddedCursor(tribleSet.AEV.cursor(), tribleSet.AEV.constructor.segments, 32);
    this.aveCursor = new PaddedCursor(tribleSet.AVE.cursor(), tribleSet.AVE.constructor.segments, 32);
    this.veaCursor = new PaddedCursor(tribleSet.VEA.cursor(), tribleSet.VEA.constructor.segments, 32);
    this.vaeCursor = new PaddedCursor(tribleSet.VAE.cursor(), tribleSet.VAE.constructor.segments, 32);
  }

  peekByte() {
    switch(this.state) {
      case stack_empty: throw new error("unreachable");

      case stack_e: return this.eavCursor.peek();
      case stack_a: return this.aevCursor.peek();
      case stack_v: return this.veaCursor.peek();

      case stack_ea: return this.eavCursor.peek();
      case stack_ev: return this.evaCursor.peek();
      case stack_ae: return this.aevCursor.peek();
      case stack_av: return this.aveCursor.peek();
      case stack_ve: return this.veaCursor.peek();
      case stack_va: return this.vaeCursor.peek();

      case stack_eav: return this.eavCursor.peek();
      case stack_eva: return this.evaCursor.peek();
      case stack_aev: return this.aevCursor.peek();
      case stack_ave: return this.aveCursor.peek();
      case stack_vea: return this.veaCursor.peek();
      case stack_vae: return this.vaeCursor.peek();
      }
  }

  proposeByte(bitset) {
    switch(this.state) {
      case stack_empty: throw new error("unreachable");

      case stack_e: this.eavCursor.propose(bitset); return;
      case stack_a: this.aevCursor.propose(bitset); return;
      case stack_v: this.veaCursor.propose(bitset); return;

      case stack_ea: this.eavCursor.propose(bitset); return;
      case stack_ev: this.evaCursor.propose(bitset); return;
      case stack_ae: this.aevCursor.propose(bitset); return;
      case stack_av: this.aveCursor.propose(bitset); return;
      case stack_ve: this.veaCursor.propose(bitset); return;
      case stack_va: this.vaeCursor.propose(bitset); return;

      case stack_eav: this.eavCursor.propose(bitset); return;
      case stack_eva: this.evaCursor.propose(bitset); return;
      case stack_aev: this.aevCursor.propose(bitset); return;
      case stack_ave: this.aveCursor.propose(bitset); return;
      case stack_vea: this.veaCursor.propose(bitset); return;
      case stack_vae: this.vaeCursor.propose(bitset); return;
    }
  }

  pushByte(byte) {
    switch(this.state) {
      case stack_empty: throw new error("unreachable");

      case stack_e: this.eavCursor.push(byte); this.evaCursor.push(byte); return;
      case stack_a: this.aevCursor.push(byte); this.aveCursor.push(byte); return;
      case stack_v: this.veaCursor.push(byte); this.vaeCursor.push(byte); return;

      case stack_ea: this.eavCursor.push(byte); return;
      case stack_ev: this.evaCursor.push(byte); return;
      case stack_ae: this.aevCursor.push(byte); return;
      case stack_av: this.aveCursor.push(byte); return;
      case stack_ve: this.veaCursor.push(byte); return;
      case stack_va: this.vaeCursor.push(byte); return;

      case stack_eav: this.eavCursor.push(byte); return;
      case stack_eva: this.evaCursor.push(byte); return;
      case stack_aev: this.aevCursor.push(byte); return;
      case stack_ave: this.aveCursor.push(byte); return;
      case stack_vea: this.veaCursor.push(byte); return;
      case stack_vae: this.vaeCursor.push(byte); return;
    }
  }

  popByte() {
    switch(this.state) {
      case stack_empty: throw new error("unreachable");

      case stack_e: this.eavCursor.pop(); this.evaCursor.pop(); return;
      case stack_a: this.aevCursor.pop(); this.aveCursor.pop(); return;
      case stack_v: this.veaCursor.pop(); this.vaeCursor.pop(); return;

      case stack_ea: this.eavCursor.pop(); return;
      case stack_ev: this.evaCursor.pop(); return;
      case stack_ae: this.aevCursor.pop(); return;
      case stack_av: this.aveCursor.pop(); return;
      case stack_ve: this.veaCursor.pop(); return;
      case stack_va: this.vaeCursor.pop(); return;

      case stack_eav: this.eavCursor.pop(); return;
      case stack_eva: this.evaCursor.pop(); return;
      case stack_aev: this.aevCursor.pop(); return;
      case stack_ave: this.aveCursor.pop(); return;
      case stack_vea: this.veaCursor.pop(); return;
      case stack_vae: this.vaeCursor.pop(); return;
    }
  }

  variables(bitset) {
    bitset.unsetAll();
    bitset.set(this.eVar);
    bitset.set(this.aVar);
    bitset.set(this.vVar);
  }

  pushVariable(variable) {
      if(this.eVar === variable) {
        switch(this.state) {
          case stack_empty: this.state = stack_e; return;

          case stack_a: this.state = stack_ae; return;
          case stack_v: this.state = stack_ve; return;

          case stack_av: this.state = stack_ave; return;
          case stack_va: this.state = stack_vae; return;

          default: throw new Error("unreachable");
        }
      }
      if(this.aVar === variable) {
        switch(this.state) {
          case stack_empty: this.state = stack_a; return;

          case stack_e: this.state = stack_ea; return;
          case stack_v: this.state = stack_va; return;

          case stack_ev: this.state = stack_eva; return;
          case stack_ve: this.state = stack_vea; return;

          default: throw new Error("unreachable");
        }
      }
      if(this.vVar == variable) {
        switch(this.state) {
          case stack_empty: this.state = stack_v; return;

          case stack_e: this.state = stack_ev; return;
          case stack_a: this.state = stack_av; return;

          case stack_ea: this.state = stack_eav; return;
          case stack_ae: this.state = stack_aev; return;

          default: throw new Error("unreachable"); return;
        }
      }

  }

  popVariable() {
      switch(this.state) {
          case stack_empty: throw new Error("unreachable");

          case stack_e:
          case stack_a:
          case stack_v: this.state = stack_empty; return;

          case stack_ea:
          case stack_ev: this.state = stack_e; return;
          case stack_ae:
          case stack_av: this.state = stack_a; return;
          case stack_ve:
          case stack_va: this.state = stack_v; return;

          case stack_eav: this.state = stack_ea; return;
          case stack_eva: this.state = stack_ev; return;
          case stack_aev: this.state = stack_ae; return;
          case stack_ave: this.state = stack_av; return;
          case stack_vea: this.state = stack_ve; return;
          case stack_vae: this.state = stack_va; return;
      }
  }

  countVariable(variable) {
      if(this.eVar === variable) {
        switch(this.state) {
          case stack_empty: return this.eavCursor.segmentCount();

          case stack_a: return this.aevCursor.segmentCount();
          case stack_v: return this.veaCursor.segmentCount();

          case stack_av: return this.aveCursor.segmentCount();
          case stack_va: return this.vaeCursor.segmentCount();

          default: throw new Error("unreachable");
        }
      }
      if(this.aVar === variable) {
        switch(this.state) {
            case stack_empty: return this.aevCursor.segmentCount();

            case stack_e: return this.eavCursor.segmentCount();
            case stack_v: return this.vaeCursor.segmentCount();

            case stack_ev: return this.evaCursor.segmentCount();
            case stack_ve: return this.veaCursor.segmentCount();

            default: throw new Error("unreachable");
        }
      }
      if(this.vVar === variable) {
        switch(this.state) {
            case stack_empty: return this.veaCursor.segmentCount();

            case stack_e: return this.evaCursor.segmentCount();
            case stack_a: return this.aveCursor.segmentCount();

            case stack_ea: return this.eavCursor.segmentCount();
            case stack_ae: return this.aevCursor.segmentCount();

            default: throw new Error("unreachable");
        }
      }
  }
}

function flush_trible_buffer(
  buffer,
  EAV,
  EVA,
  AEV,
  AVE,
  VEA,
  VAE
) {
  for (const trible of buffer) {
    EAV.put(scrambleEAV(trible));
  }
  for (const trible of buffer) {
    EVA.put(scrambleEVA(trible));
  }
  for (const trible of buffer) {
    AEV.put(scrambleAEV(trible));
  }
  for (const trible of buffer) {
    AVE.put(scrambleAVE(trible));
  }
  for (const trible of buffer) {
    VEA.put(scrambleVEA(trible));
  }
  for (const trible of buffer) {
    VAE.put(scrambleVAE(trible));
  }
}

const BUFFER_SIZE = 64;
class TribleSet {
  constructor(
    EAV = emptyIdIdValueTriblePACT,
    EVA = emptyIdValueIdTriblePACT,
    AEV = emptyIdIdValueTriblePACT,
    AVE = emptyIdValueIdTriblePACT,
    VEA = emptyValueIdIdTriblePACT,
    VAE = emptyValueIdIdTriblePACT
  ) {
    this.EAV = EAV;
    this.EVA = EVA;
    this.AEV = AEV;
    this.AVE = AVE;
    this.VEA = VEA;
    this.VAE = VAE;
  }

  with(tribles) {
    const EAV = this.EAV.batch();
    const EVA = this.EVA.batch();
    const AEV = this.AEV.batch();
    const AVE = this.AVE.batch();
    const VEA = this.VEA.batch();
    const VAE = this.VAE.batch();

    const buffer = new Array(BUFFER_SIZE);
    buffer.length = 0;
    for (const t of tribles) {
      buffer.push(t);
      if (buffer.length === BUFFER_SIZE) {
        flush_trible_buffer(
          buffer,
          EAV,
          EVA,
          AEV,
          AVE,
          VEA,
          VAE
        );
        buffer.length = 0;
      }
    }
    flush_trible_buffer(buffer, EAV, EVA, AEV, AVE, VEA, VAE);

    return new TribleSet(
      EAV.complete(),
      EVA.complete(),
      AEV.complete(),
      AVE.complete(),
      VEA.complete(),
      VAE.complete()
    );
  }

  /**
   * Provides a way to dump all tribles this db in EAV lexicographic order.
   * @returns an iterator of tribles
   */
  tribles() {
    return this.EAV.keys();
  }

  patternConstraint(triples) {
    return new IntersectionConstraint(triples.map(([e,a,v]) => new MemTribleConstraint(this, e, a, v)));
  }

  count() {
    return this.EAV.count();
  }

  empty() {
    return new TribleSet();
  }

  isEmpty() {
    return this.EAV.isEmpty();
  }

  isEqual(other) {
    return this.EAV.isEqual(other.EAV);
  }

  isSubsetOf(other) {
    return this.EAV.isSubsetOf(other.indexE);
  }

  isIntersecting(other) {
    return this.EAV.isIntersecting(other.indexE);
  }

  union(other) {
    return new TribleSet(
      this.EAV.union(other.EAV),
      this.EVA.union(other.EVA),
      this.AEV.union(other.AEV),
      this.AVE.union(other.AVE),
      this.VEA.union(other.VEA),
      this.VAE.union(other.VAE)
    );
  }

  subtract(other) {
    return new TribleSet(
      this.EAV.subtract(other.EAV),
      this.EVA.subtract(other.EVA),
      this.AEV.subtract(other.AEV),
      this.AVE.subtract(other.AVE),
      this.VEA.subtract(other.VEA),
      this.VAE.subtract(other.VAE)
    );
  }

  difference(other) {
    return new TribleSet(
      this.EAV.difference(other.EAV),
      this.EVA.difference(other.EVA),
      this.AEV.difference(other.AEV),
      this.AVE.difference(other.AVE),
      this.VEA.difference(other.VEA),
      this.VAE.difference(other.VAE)
    );
  }

  intersect(other) {
    return new TribleSet(
      this.EAV.intersect(other.EAV),
      this.EVA.intersect(other.EVA),
      this.AEV.intersect(other.AEV),
      this.AVE.intersect(other.AVE),
      this.VEA.intersect(other.VEA),
      this.VAE.intersect(other.VAE)
    );
  }
}

export { TribleSet };
