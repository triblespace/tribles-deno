import { S3Client } from "https://deno.land/x/s3_lite_client@0.6.1/mod.ts";
import { ClientOptions } from "https://deno.land/x/s3_lite_client@0.6.1/client.ts";

import { KB } from "../kb.ts";
import { Value } from "../trible.ts";
import { Commit } from "../commit.ts";

function hashToName(hash: Value) {
  return Array.from(hash).map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function s3Store(config: ClientOptions) {
  const client = new S3Client(config);

  const missHandler = async (hash: Value) => {
    const request = await client.getObject(hashToName(hash));
    return request.body;
  };

  const flush = async (commit: Commit) => {
    const blobcache = commit.kb.blobcache;
    const flushedBlobs = blobcache.strongBlobs();
    const flushOps = flushedBlobs.map(({ key, blob }) =>
      client.putObject(hashToName(key), blob)
    );
    await Promise.all(flushOps);

    return new KB(commit.kb.tribleset, blobcache.clear());
  };

  return {
    missHandler,
    flush,
  };
}
