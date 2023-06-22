import { S3Client } from "https://deno.land/x/s3_lite_client@0.6.0/mod.ts";
import { KB } from "../kb.js";

function hashToName(hash) {
  return Array.from(hash).map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function s3Store(config) {
  const client = new S3Client(config);

  const missHandler = async (hash) => {
    const request = await client.getObject(hashToName(hash));
    return request.body;
  }

  const flush = async (commit) => {
      const blobcache = commit.kb.blobcache;
      const flushedBlobs = blobcache.strongBlobs();
      const flushOps = flushedBlobs.map(({ key, blob }) =>
        client.putObject(hashToName(key), blob)
      );
      await Promise.all(flushOps);

      return new KB(commit.currentKB.tribleset, blobcache.clear());
  };

  return {
    missHandler,
    flush
  };
}
