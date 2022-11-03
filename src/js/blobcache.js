import { emptyValuePACT, emptyValueIdIdTriblePACT, SegmentConstraint } from "./pact.js";
import { scrambleVAE } from "./trible.js";

export class BlobCache {
  constructor(onMiss = async () => {},
              strong = emptyValueIdIdTriblePACT,
              weak = emptyValuePACT) {
    this.strong = strong;
    this.weak = weak;
    this.onMiss = onMiss;
  }

  put(trible, blob) {
    let weak = this.weak;
    let new_or_cached_blob = blob;

    const key = V(trible);
    const cached_blob = this.weak.get(key).deref();
    if(cached_blob === undefined) {
      weak = weak.put(key, new WeakRef(blob));
    } else {
      new_or_cached_blob = cached_blob;
    }
    const strong = this.strong.put(scrambleVAE(trible), new_or_cached_blob);
    return new BlobCache(this.onMiss, strong, weak);
  }

  async get(key) {
    let blob = this.weak.get(key).deref();

    if (blob === undefined) {
      blob = await this.onMiss(key);
      if (blob === undefined) {
        throw Error("No blob for key.");
      }
      this.weak = this.weak.put(key, new WeakRef(blob));
    }
    return blob;
  }

  strongConstraint(e, a, v) {
    return new SegmentConstraint(this.strong, [v, a, e]);
  }

  *strongBlobs() {
    for (const r of new Query(new MaskedConstraint(new SegmentConstraint(this.strong, [0, 1, 2]), [1, 2]))) {
      const v = r.get(1);
      const blob = this.weak.get(v);
      yield [v, blob];
    }
  }

  empty() {
    return new BlobCache(this.onMiss, this.strong.empty(), this.weak);
  }

  clear() {
    return new BlobCache(this.onMiss, this.strong.empty(), this.weak.empty());
  }

  union(other) {
    if(this.onMiss !== other.onMiss) {
      throw new Error("Can only operate on two BlobCaches with the same onMiss handler.");
    }
    return new BlobCache(
      this.onMiss,
      this.strong.union(other.strong),
      this.weak.union(other.weak)
    );
  }

  subtract(other) {
    if(this.onMiss !== other.onMiss) {
      throw new Error("Can only operate on two BlobCaches with the same onMiss handler.");
    }
    return new BlobCache(
      this.onMiss,
      this.strong.subtract(other.strong),
      this.weak.union(other.weak)
    );
  }

  difference(other) {
    if(this.onMiss !== other.onMiss) {
      throw new Error("Can only operate on two BlobCaches with the same onMiss handler.");
    }
    return new BlobCache(
      this.onMiss,
      this.strong.difference(other.strong),
      this.weak.union(other.weak)
    );
  }

  intersect(other) {
    if(this.onMiss !== other.onMiss) {
      throw new Error("Can only operate on two BlobCaches with the same onMiss handler.");
    }
    return new BlobCache(
      this.onMiss,
      this.strong.intersect(other.strong),
      this.weak.union(other.weak)
    );
  }

}
