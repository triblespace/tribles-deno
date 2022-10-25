import { emptyValuePACT, emptyValueIdIdTriblePACT, SegmentConstraint } from "./pact.js";
import { scrambleVAE } from "./trible.js";

export class BlobCache {
  constructor(uncommitted = emptyValueIdIdTriblePACT, cached = emptyValuePACT, onMiss = async () => {throw Error("Cache-miss not implemented.");}) {
    this.uncommitted = uncommitted;
    this.cached = cached;
    this.onMiss = onMiss;
  }

  put(trible, blob) {
    let cached = this.cached;
    let new_or_cached_blob = blob;

    const key = V(trible);
    const cached_blob = this.cached.get(key).deref();
    if(cached_blob === undefined) {
      cached = cached.put(key, new WeakRef(blob));
    } else {
      new_or_cached_blob = cached_blob;
    }
    const uncommitted = this.uncommitted.put(scrambleVAE(trible), new_or_cached_blob);
    return new BlobCache(uncommitted, cached, this.onMiss);
  }

  async get(key) {
    let blob = this.cached.get(key).deref();

    if (blob === undefined) {
      if(uncommitted.getPrefix(key))

      blob = await this.onMiss(key);
      if (blob === undefined) {
        throw Error("No blob for key.");
      }
      this.cache = this.cache.put(key, new WeakRef(blob));
    }
    return blob;
  }

  async flush(storeFn) {
    for (const r of new Query(
      new IntersectionConstraint([
        new MaskedConstraint(new SegmentConstraint(this.uncommitted, [0, 1, 2]), [1, 2]),
      ]),
    )) {
      const v = r.get(1);
      const blob = this.cached.get(v);
      await storeFn(blob);
    }

    this.uncommitted = this.uncommitted.empty();
  }

  empty() {
    return new BlobCache(this.uncommitted.empty(), this.cached.empty(), this.onMiss);
  }

  union(other) {
    if(this.onMiss !== other.onMiss) {
      throw new Error("Can only operate on two BlobCaches with the same onMiss handler.");
    }
    return new BlobCache(
      this.uncommitted.union(other.uncommitted),
      this.cached.union(other.cached),
      this.onMiss
    );
  }

  subtract(other) {
    if(this.onMiss !== other.onMiss) {
      throw new Error("Can only operate on two BlobCaches with the same onMiss handler.");
    }
    return new BlobCache(
      this.uncommitted.subtract(other.uncommitted),
      this.cached.union(other.cached),
      this.onMiss
    );
  }

  difference(other) {
    if(this.onMiss !== other.onMiss) {
      throw new Error("Can only operate on two BlobCaches with the same onMiss handler.");
    }
    return new BlobCache(
      this.uncommitted.difference(other.uncommitted),
      this.cached.union(other.cached),
      this.onMiss
    );
  }

  intersect(other) {
    if(this.onMiss !== other.onMiss) {
      throw new Error("Can only operate on two BlobCaches with the same onMiss handler.");
    }
    return new BlobCache(
      this.uncommitted.intersect(other.uncommitted),
      this.cached.union(other.cached),
      this.onMiss
    );
  }

}
