const { emptyValuePART } = require("./part.js");

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
      nblobs = nblobs.put(key, (old) => old || blob);
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
    console.warn(
      "MemBlobDB does not implement shrinking yet, so performing non-monotonic KB set operations will potentially leak memory.",
    );
    return this;
  }
}

module.exports = { MemBlobDB };
