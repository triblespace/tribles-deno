import { S3Bucket } from "https://deno.land/x/s3@0.3.0/mod.ts";

function hashToName(hash) {
  return Array.from(hash).map(byte => byte.toString(16).padStart(2, "0")).join('');
}

function S3BlobConnector(
  config,
  bucket = new S3Bucket(config),
) {
  return {
    missHandler: async (hash) => {
      const request = await bucket.getObject(hashToName(hash));
      return request.body;
    },
    flushHandler: async (txn) => {
      for (const [key, blob] of txn.commitKB.blobcache.blobs.entries()) {
        await bucket.putObject(hashToName(key), blob);
      }
    }
  };
}

export { S3BlobConnector };
