import { VALUE_PART } from "./part.js";

class BlobBD {
  constructor(
    blobs = VALUE_PART,
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

    this.blobs = nblobs.complete();
    return this;
  }

  get(k) {
    return this.blobs.get(k);
  }
}

const defaultBlobDB = new BlobBD();

export { BlobBD, defaultBlobDB };
