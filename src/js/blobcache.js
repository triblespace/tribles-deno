import { emptyValuePACT } from "./pact.js";
import { VALUE_SIZE } from "./trible.js";

class BlobCache {
  constructor(blobs = emptyValuePACT, missHandlers = new Set()) {
    this.blobs = blobs;
    this.missHandlers = missHandlers;
  }

  put(key, blob) {
    return new BlobCache(this.blobs.put(key, blob));
  }

  async get(key) {
    let blob = await this.blobs.get(key);

    if (blob === undefined) {
      for (const missHandler of this.missHandlers) {
        blob = await missHandler(key);
        if (blob !== undefined) break;
      }
      if (blob === undefined) {
        throw Error("No blob for key.");
      }
      this.cache = this.cache.put(key, blob);
    }
    return blob;
  }

  empty() {
    return new BlobCache();
  }

  merge(other) {
    return new BlobCache(
      this.blobs.union(other.blobs),
      new Set([...this.missHandlers, ...other.missHandlers])
    );
  }

  shrink(tribleset) {
    const blobs = this.blobs.intersect(tribleset.VEA);
    return new BlobCache(blobs.complete(), this.missHandlers);
  }
}

export { BlobCache };
