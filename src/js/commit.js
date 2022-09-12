import * as ed from "https://deno.land/x/ed25519/mod.ts";

import { TribleSet } from "./tribleset.js";
import { TRIBLE_SIZE, VALUE_SIZE } from "./trible.js";

const MARKER_SIZE = TRIBLE_SIZE * 2;

async function serializetribleset(tribleset, privateKey) {
  // TODO This could be done lazily if we knew the size of a tribleset,
  // which we should def add.
  const triblesEager = [...tribleset.tribles()];
  const data = new Uint8Array(MARKER_SIZE + TRIBLE_SIZE * triblesEager.length);
  const tribles = data.subarray(MARKER_SIZE);
  for (let i = 0; i < triblesEager.length; i++) {
    tribles.set(triblesEager[i], i * TRIBLE_SIZE);
  }
  const signature = await ed.sign(tribles, privateKey);
  data.subarray(64, 128).put(signature);

  const payloadLength = tribles.length;
  const payloadLengthView = new Uint32Array(
    data.buffer,
    data.byteOffset + 24,
    2
  );
  payloadLengthView[1] = payloadLength & 0x00000000ffffffff;
  payloadLengthView[0] = payloadLength & 0xffffffff00000000;

  return data;
}

async function readTxnType() {}

async function readTxnMarker(bytes) {
  if (bytes.length < MARKER_SIZE) return null;

  const view = new Uint32Array(bytes.buffer, bytes.byteOffset, 4);
  if (!(view[0] === 0 && view[1] === 0 && view[2] === 0 && view[3] === 0)) {
    return null;
  }

  const publicKey = bytes.subarray(32, 64);
  const signature = bytes.subarray(64, 128);

  return [{ payloadLength, publicKey, signature }, bytes.subarray(MARKER_SIZE)];
}

async function readTxn(bytes) {
  let payloadLength, publicKey, signature;
  [{ payloadLength, publicKey, signature }, bytes] = readTxnMarker(bytes);

  if (payloadLength > bytes.length) {
    throw Error("Bad Txn: Marker declares more bytes than available.");
  }
  const payload = bytes.subarray(0, payloadLength);

  const isSigned = await ed.verify(signature, payload, publicKey);
  if (!isSigned) throw Error("Bad Txn: Couldn't verify signature.");

  return [{ payload, publicKey }, bytes.subarray(payloadLength)];
}

const TRIBLE_SIZE_IN_UINT32 = TRIBLE_SIZE / Uint32Array.BYTES_PER_ELEMENT;
function recoverFromBrokenTxn(bytes) {
  const view = new Uint32Array(bytes.buffer, bytes.byteOffset);

  for (let i = 0; i < view.length - 4; i = i + TRIBLE_SIZE_IN_UINT32) {
    if (
      view[i] === 0 &&
      view[i + 1] === 0 &&
      view[i + 2] === 0 &&
      view[i + 3] === 0
    ) {
      return bytes.subarray(i * Uint32Array.BYTES_PER_ELEMENT);
    }
  }
}

export function splitTribles(bytes) {
  const tribles = [];
  for (let t = 0; t < bytes.length; t += TRIBLE_SIZE) {
    tribles.push(bytes.subarray(t, t + TRIBLE_SIZE));
  }
  return tribles;
}

export async function* readAllTxns(bytes) {
  while (bytes.length > MARKER_SIZE) {
    try {
      let [{ payload, publicKey }, bytes] = await readTxn(bytes);
      yield {
        publicKey,
        tribleset: new TribleSet().with(splitTribles(payload)),
      };
    } catch (e) {
      bytes = recoverFromBrokenTxn(bytes);
    }
  }
}

export async function serialize(kb) {}
