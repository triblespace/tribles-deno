import { emptyValuePACT, emptyValueIdIdTriblePACT, SegmentConstraint } from "./pact.js";
import { scrambleVAE } from "./trible.js";

export class BlobCache {
  constructor(onMiss = async () => {throw Error("Cache-miss not implemented.");},
              onFlush = async () => {throw Error("Flush not implemented.");},
              uncommitted = emptyValueIdIdTriblePACT, cached = emptyValuePACT,) {
    this.uncommitted = uncommitted;
    this.cached = cached;
    this.onMiss = onMiss;
    this.onFlush = onFlush;
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
    return new BlobCache(this.onMiss, this.onFlush, uncommitted, cached);
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

  async flush() {
    for (const r of new Query(
      new IntersectionConstraint([
        new MaskedConstraint(new SegmentConstraint(this.uncommitted, [0, 1, 2]), [1, 2]),
      ]),
    )) {
      const v = r.get(1);
      const blob = this.cached.get(v);
      await this.onFlush(v, blob);
    }

    const flushed = this.uncommitted;
    this.uncommitted = this.uncommitted.empty();
    return flushed;
  }

  empty() {
    return new BlobCache(this.uncommitted.empty(), this.cached.empty(), this.onMiss);
  }

  union(other) {
    if(this.onMiss !== other.onMiss) {
      throw new Error("Can only operate on two BlobCaches with the same onMiss handler.");
    }
    if(this.onFlush !== other.onFlush) {
      throw new Error("Can only operate on two BlobCaches with the same onFlush handler.");
    }
    return new BlobCache(
      this.onMiss,
      this.onFlush,
      this.uncommitted.union(other.uncommitted),
      this.cached.union(other.cached)
    );
  }

  subtract(other) {
    if(this.onMiss !== other.onMiss) {
      throw new Error("Can only operate on two BlobCaches with the same onMiss handler.");
    }
    if(this.onFlush !== other.onFlush) {
      throw new Error("Can only operate on two BlobCaches with the same onFlush handler.");
    }
    return new BlobCache(
      this.onMiss,
      this.onFlush,
      this.uncommitted.subtract(other.uncommitted),
      this.cached.union(other.cached)
    );
  }

  difference(other) {
    if(this.onMiss !== other.onMiss) {
      throw new Error("Can only operate on two BlobCaches with the same onMiss handler.");
    }
    if(this.onFlush !== other.onFlush) {
      throw new Error("Can only operate on two BlobCaches with the same onFlush handler.");
    }
    return new BlobCache(
      this.onMiss,
      this.onFlush,
      this.uncommitted.difference(other.uncommitted),
      this.cached.union(other.cached)
    );
  }

  intersect(other) {
    if(this.onMiss !== other.onMiss) {
      throw new Error("Can only operate on two BlobCaches with the same onMiss handler.");
    }
    if(this.onFlush !== other.onFlush) {
      throw new Error("Can only operate on two BlobCaches with the same onFlush handler.");
    }
    return new BlobCache(
      this.onMiss,
      this.onFlush,
      this.uncommitted.intersect(other.uncommitted),
      this.cached.union(other.cached)
    );
  }

}
