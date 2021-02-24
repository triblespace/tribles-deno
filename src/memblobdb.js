import { emptyValuePART } from "./part.js";
import { VALUE_SIZE } from "./trible.js";

class MemBlobDB {
  constructor(
    blobs = emptyValuePART,
  ) {
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
    return (other instanceof MemBlobDB) &&
      (this.blobs.isEqual(other.blobs));
  }

  merge(other) {
    return new MemBlobDB(this.blobs.union(other.blobs));
  }

  shrink(tribledb) {
    const blobs = emptyValuePART.batch();
    const blobCursor = this.blobs.cursor();
    const valueCursor = tribledb.VEA.cursor();
    if (blobCursor.valid() && valueCursor.valid) {
      blobCursor.push(VALUE_SIZE);
      valueCursor.push(VALUE_SIZE);
      search:
      while (true) {
        const match = blobCursor.seek(valueCursor.peek());
        if (!blobCursor.valid()) break search;
        if (match) {
          blobs.put(blobCursor.peek(), blobCursor.value());
        }
        blobCursor.next();
        if (!blobCursor.valid()) break search;
        valueCursor.seek(blobCursor.peek());
        if (!valueCursor.valid) break search;

        continue search;
      }
    }
    return MemBlobDB(blobs.complete());
  }
}

export { MemBlobDB };
