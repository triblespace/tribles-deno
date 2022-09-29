import { KB } from "./kb.js";
import { Head } from "./head.js";
import { types } from "./types.js";
import { id } from "./namespace.js";

const { authorId, signatureId } =
  UFOID.namedCache();

export const authNS = {
  [id]: { ...types.ufoid },
  author: { id: authorId, isLink: true},
  pubkey: { id: signatureId, ...types.blaked25519PubKey}
};

export const keychain = new Head();

