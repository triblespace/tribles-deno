import { emptyValuePACT } from "./pact.js";
import { VALUE_SIZE } from "./trible.js";

class BlobCache {
  constructor(
    blobs = emptyValuePACT,
    missHandlers = new Set(),
  ) {
    this.blobs = blobs;
    this.missHandlers = missHandlers;
  }

  put(blobs) {
    let nblobs = this.blobs.batch();
    for (let b = 0; b < blobs.length; b++) {
      const [key, blob] = blobs[b];
      nblobs = nblobs.put(key, blob);
    }

    return new BlobCache(nblobs.complete());
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
      new Set([...this.missHandlers, ...other.missHandlers]),
    );
  }

  shrink(tribleset) {
    const blobs = emptyValuePACT.batch();
    const blobCursor = this.blobs.segmentCursor();
    const valueCursor = tribleset.VEA.segmentCursor();
    blobCursor.push();
    valueCursor.push();
    const key = new Uint8Array(VALUE_SIZE);
    if (blobCursor.isValid() && valueCursor.isValid()) {
      search:
      while (true) {
        if (!valueCursor.peek(key)) break search;
        const match = blobCursor.seek(key);
        if (!blobCursor.peek(key)) break search;
        if (match) {
          blobs.put(key.slice(), blobCursor.value());
        }
        if (!nextKey(key)) break search;
        valueCursor.seek(key);
      }
    }
    return new BlobCache(blobs.complete(), this.missHandlers);
  }
}

export { BlobCache };
