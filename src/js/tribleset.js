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
const stack_ea = 4;
const stack_ae = 6;
const stack_av = 7;
const stack_eav = 10;
const stack_aev = 12;
const stack_ave = 13;

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
    this.aevCursor = new PaddedCursor(tribleSet.AEV.cursor(), tribleSet.AEV.constructor.segments, 32);
    this.aveCursor = new PaddedCursor(tribleSet.AVE.cursor(), tribleSet.AVE.constructor.segments, 32);
  }

  peekByte() {
    switch(this.state) {
      case stack_empty: throw new error("unreachable");

      case stack_e: return this.eavCursor.peek();
      case stack_a: return this.aevCursor.peek();

      case stack_ea: return this.eavCursor.peek();
      case stack_ae: return this.aevCursor.peek();
      case stack_av: return this.aveCursor.peek();

      case stack_eav: return this.eavCursor.peek();
      case stack_aev: return this.aevCursor.peek();
      case stack_ave: return this.aveCursor.peek();
      }
  }

  proposeByte(bitset) {
    switch(this.state) {
      case stack_empty: throw new error("unreachable");

      case stack_e: this.eavCursor.propose(bitset); return;
      case stack_a: this.aevCursor.propose(bitset); return;

      case stack_ea: this.eavCursor.propose(bitset); return;
      case stack_ae: this.aevCursor.propose(bitset); return;
      case stack_av: this.aveCursor.propose(bitset); return;

      case stack_eav: this.eavCursor.propose(bitset); return;
      case stack_aev: this.aevCursor.propose(bitset); return;
      case stack_ave: this.aveCursor.propose(bitset); return;
    }
  }

  pushByte(byte) {
    switch(this.state) {
      case stack_empty: throw new error("unreachable");

      case stack_e: this.eavCursor.push(byte); this.evaCursor.push(byte); return;
      case stack_a: this.aevCursor.push(byte); this.aveCursor.push(byte); return;

      case stack_ea: this.eavCursor.push(byte); return;
      case stack_ae: this.aevCursor.push(byte); return;
      case stack_av: this.aveCursor.push(byte); return;

      case stack_eav: this.eavCursor.push(byte); return;
      case stack_aev: this.aevCursor.push(byte); return;
      case stack_ave: this.aveCursor.push(byte); return;
    }
  }

  popByte() {
    switch(this.state) {
      case stack_empty: throw new error("unreachable");

      case stack_e: this.eavCursor.pop(); this.evaCursor.pop(); return;
      case stack_a: this.aevCursor.pop(); this.aveCursor.pop(); return;

      case stack_ea: this.eavCursor.pop(); return;
      case stack_ae: this.aevCursor.pop(); return;
      case stack_av: this.aveCursor.pop(); return;

      case stack_eav: this.eavCursor.pop(); return;
      case stack_aev: this.aevCursor.pop(); return;
      case stack_ave: this.aveCursor.pop(); return;
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
    switch(this.state) {
      case stack_empty:
      case stack_e:
        bitset.set(this.vVar);
        return;
      default: return;
    }
  }

  pushVariable(variable) {
      if(this.eVar === variable) {
        switch(this.state) {
          case stack_empty: this.state = stack_e; return;

          case stack_a: this.state = stack_ae; return;

          case stack_av: this.state = stack_ave; return;

          default: throw new Error("unreachable");
        }
      }
      if(this.aVar === variable) {
        switch(this.state) {
          case stack_empty: this.state = stack_a; return;

          case stack_e: this.state = stack_ea; return;

          default: throw new Error("unreachable");
        }
      }
      if(this.vVar == variable) {
        switch(this.state) {
          case stack_a: this.state = stack_av; return;

          case stack_ea: this.state = stack_eav; return;
          case stack_ae: this.state = stack_aev; return;

          default: throw new Error("unreachable"); return;
        }
      }

  }

  popVariable() {
      switch(this.state) {
          case stack_e:
          case stack_a: this.state = stack_empty; return;

          case stack_ea: this.state = stack_e; return;
          case stack_ae:
          case stack_av: this.state = stack_a; return;

          case stack_eav: this.state = stack_ea; return;
          case stack_aev: this.state = stack_ae; return;
          case stack_ave: this.state = stack_av; return;

          default: throw new Error("unreachable");
      }
  }

  countVariable(variable) {
      if(this.eVar === variable) {
        switch(this.state) {
          case stack_empty: return this.eavCursor.segmentCount();

          case stack_a: return this.aevCursor.segmentCount();

          case stack_av: return this.aveCursor.segmentCount();

          default: throw new Error("unreachable");
        }
      }
      if(this.aVar === variable) {
        switch(this.state) {
            case stack_empty: return this.aevCursor.segmentCount();

            case stack_e: return this.eavCursor.segmentCount();

            default: throw new Error("unreachable");
        }
      }
      if(this.vVar === variable) {
        switch(this.state) {
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
  AEV,
  AVE
) {
  for (const trible of buffer) {
    EAV.put(scrambleEAV(trible));
  }
  for (const trible of buffer) {
    AEV.put(scrambleAEV(trible));
  }
  for (const trible of buffer) {
    AVE.put(scrambleAVE(trible));
  }
}

const BUFFER_SIZE = 64;
class TribleSet {
  constructor(
    EAV = emptyIdIdValueTriblePACT,
    AEV = emptyIdIdValueTriblePACT,
    AVE = emptyIdValueIdTriblePACT,
  ) {
    this.EAV = EAV;
    this.AEV = AEV;
    this.AVE = AVE;
  }

  with(tribles) {
    const EAV = this.EAV.batch();
    const AEV = this.AEV.batch();
    const AVE = this.AVE.batch();

    const buffer = new Array(BUFFER_SIZE);
    buffer.length = 0;
    for (const t of tribles) {
      buffer.push(t);
      if (buffer.length === BUFFER_SIZE) {
        flush_trible_buffer(
          buffer,
          EAV,
          AEV,
          AVE
        );
        buffer.length = 0;
      }
    }
    flush_trible_buffer(buffer, EAV, AEV, AVE);

    return new TribleSet(
      EAV.complete(),
      AEV.complete(),
      AVE.complete()
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
      this.AEV.union(other.AEV),
      this.AVE.union(other.AVE)
    );
  }

  subtract(other) {
    return new TribleSet(
      this.EAV.subtract(other.EAV),
      this.AEV.subtract(other.AEV),
      this.AVE.subtract(other.AVE)
    );
  }

  difference(other) {
    return new TribleSet(
      this.EAV.difference(other.EAV),
      this.AEV.difference(other.AEV),
      this.AVE.difference(other.AVE)
    );
  }

  intersect(other) {
    return new TribleSet(
      this.EAV.intersect(other.EAV),
      this.AEV.intersect(other.AEV),
      this.AVE.intersect(other.AVE)
    );
  }
}

export { TribleSet };
