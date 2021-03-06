import { emptySegmentPART, emptyTriblePART } from "./cuckoopartint32.js";
import {
  A,
  E,
  equalId,
  scrambleAEV,
  scrambleAVE,
  scrambleEAV,
  scrambleEVA,
  scrambleVAE,
  scrambleVEA,
  V1,
  v1zero,
  V2,
} from "./trible.js";

class MemTribleDB {
  constructor(
    EAV = emptyTriblePART,
    EVA = emptyTriblePART,
    AEV = emptyTriblePART,
    AVE = emptyTriblePART,
    VEA = emptyTriblePART,
    VAE = emptyTriblePART,
    EisA = emptySegmentPART,
    EisV = emptySegmentPART,
    AisV = emptySegmentPART,
    EisAisV = emptySegmentPART,
  ) {
    this.EAV = EAV;
    this.EVA = EVA;
    this.AEV = AEV;
    this.AVE = AVE;
    this.VEA = VEA;
    this.VAE = VAE;
    this.EisA = EisA;
    this.EisV = EisV;
    this.AisV = AisV;
    this.EisAisV = EisAisV;
  }

  with(tribles) {
    const EAV = this.EAV.batch();
    const EVA = this.EVA.batch();
    const AEV = this.AEV.batch();
    const AVE = this.AVE.batch();
    const VEA = this.VEA.batch();
    const VAE = this.VEA.batch();

    const EisA = this.EisA.batch();
    const EisV = this.EisV.batch();
    const AisV = this.AisV.batch();
    const EisAisV = this.EisAisV.batch();

    for (const trible of tribles) EAV.put(scrambleEAV(trible));
    for (const trible of tribles) EVA.put(scrambleEVA(trible));
    for (const trible of tribles) AEV.put(scrambleAEV(trible));
    for (const trible of tribles) AVE.put(scrambleAVE(trible));
    for (const trible of tribles) VEA.put(scrambleVEA(trible));
    for (const trible of tribles) VAE.put(scrambleVAE(trible));

    for (const trible of tribles) {
      const e = E(trible);
      const a = A(trible);
      const v2 = V2(trible);
      const eIsA = equalId(e, a);
      const eIsV = v1zero(trible) && equalId(e, v2);
      const aIsV = v1zero(trible) && equalId(a, v2);

      if (eIsA) {
        EisA = EisA.put(e);
      }
      if (eIsV) {
        EisV = EisV.put(e);
      }
      if (aIsV) {
        AisV = AisV.put(a);
      }
      if (eIsA && aIsV) {
        EisAisV = EisAisV.put(e);
      }
    }
    return new MemTribleDB(
      EAV.complete(),
      EVA.complete(),
      AEV.complete(),
      AVE.complete(),
      VEA.complete(),
      VAE.complete(),
      EisA.complete(),
      EisV.complete(),
      AisV.complete(),
      EisAisV.complete(),
    );
  }

  empty() {
    return new MemTribleDB();
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
    return new MemTribleDB(
      this.EAV.union(other.EAV),
      this.EVA.union(other.EVA),
      this.AEV.union(other.AEV),
      this.AVE.union(other.AVE),
      this.VEA.union(other.VEA),
      this.VAE.union(other.VAE),
      this.EisA.union(other.EisA),
      this.EisV.union(other.EisV),
      this.AisV.union(other.AisV),
      this.EisAisV.union(other.EisAisV),
    );
  }

  subtract(other) {
    return new MemTribleDB(
      this.EAV.subtract(other.EAV),
      this.EVA.subtract(other.EVA),
      this.AEV.subtract(other.AEV),
      this.AVE.subtract(other.AVE),
      this.VEA.subtract(other.VEA),
      this.VAE.subtract(other.VAE),
      this.EisA.subtract(other.EisA),
      this.EisV.subtract(other.EisV),
      this.AisV.subtract(other.AisV),
      this.EisAisV.subtract(other.EisAisV),
    );
  }

  difference(other) {
    return new MemTribleDB(
      this.EAV.difference(other.EAV),
      this.EVA.difference(other.EVA),
      this.AEV.difference(other.AEV),
      this.AVE.difference(other.AVE),
      this.VEA.difference(other.VEA),
      this.VAE.difference(other.VAE),
      this.EisA.difference(other.EisA),
      this.EisV.difference(other.EisV),
      this.AisV.difference(other.AisV),
      this.EisAisV.difference(other.EisAisV),
    );
  }

  intersect(other) {
    return new MemTribleDB(
      this.EAV.intersect(other.EAV),
      this.EVA.intersect(other.EVA),
      this.AEV.intersect(other.AEV),
      this.AVE.intersect(other.AVE),
      this.VEA.intersect(other.VEA),
      this.VAE.intersect(other.VAE),
      this.EisA.intersect(other.EisA),
      this.EisV.intersect(other.EisV),
      this.AisV.intersect(other.AisV),
      this.EisAisV.intersect(other.EisAisV),
    );
  }
}

export { MemTribleDB };
