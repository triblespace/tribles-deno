import { emptyValuePART } from "./part.js";

class MemBlobDB {
  constructor(
    blobs = emptyValuePART,
    blobsCount = 0,
    blobsSize = 0,
  ) {
    this.blobsCount = blobsCount;
    this.blobsSize = blobsSize;
    this.blobs = blobs;
  }

  put(blobs) {
    let blobsCount = this.blobsCount;
    let blobsSize = this.blobsSize;
    let nblobs = this.blobs.batch();
    for (let b = 0; b < blobs.length; b++) {
      const [key, blob] = blobs[b];
      nblobs = nblobs.put(key, (old) => {
        if (old) {
          return old;
        } else {
          blobsCount++;
          blobsSize += blob.length;
          return blob;
        }
      });
    }

    return new MemBlobDB(nblobs.complete(), blobsCount, blobsSize);
  }

  get(k) {
    return this.blobs.get(k);
  }

  async flush() {
    console.warn(`Can't flush MemBlobDB, because it's strictly ephemeral.
    This is probably done mistakenly. For usage with TribleMQ use S3BlobDB for example.`);
  }
}

export { MemBlobDB };
