import { emptyValuePACT } from "./pact.js";
import { VALUE_SIZE } from "./trible.js";

class MemBlobDB {
  constructor(blobs = emptyValuePACT) {
    this.blobs = blobs;
  }

  put(blobs) {
    let nblobs = this.blobs.batch();
    for (let b = 0; b < blobs.length; b++) {
      const [key, blob] = blobs[b];
      nblobs = nblobs.put(key, blob);
    }

    return new MemBlobDB(nblobs.complete());
  }

  // deno-lint-ignore require-await
  async get(k) {
    return this.blobs.get(k);
  }

  // deno-lint-ignore require-await
  async flush() {
    console.warn(`Can't flush MemBlobDB, because it's ephemeral.
    This is probably done mistakenly. For something persistent
    take a look at S3BlobDB.`);
  }

  empty() {
    return new MemBlobDB();
  }

  isEqual(other) {
    return other instanceof MemBlobDB && this.blobs.isEqual(other.blobs);
  }

  merge(other) {
    return new MemBlobDB(this.blobs.union(other.blobs));
  }

  shrink(tribledb) {
    const blobs = emptyValuePACT.batch();
    const blobCursor = this.blobs.segmentCursor();
    const valueCursor = tribledb.VEA.segmentCursor();
    blobCursor.push();
    valueCursor.push();
    const key = new Uint8Array(VALUE_SIZE);
    if (blobCursor.isValid() && valueCursor.isValid()) {
      search: while (true) {
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
    return new MemBlobDB(blobs.complete());
  }
}

export { MemBlobDB };
