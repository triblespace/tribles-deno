import { KB } from "./kb.js";
import { Head } from "./head.js";
import { types } from "./types.js";
import { id } from "./namespace.js";

const { signatureId, emailId, firstNameId, lastNameId, } =
  UFOID.namedCache();

export const authNS = {
  [id]: { ...types.ufoid },
  pubkey: { id: signatureId, ...types.blaked25519PubKey},
  authorEmail: { id: emailId, ...types.shortstring },
  authorFirstName: { id: firstNameId, ...types.shortstring },
  authorLastName: { id: lastNameId, ...types.shortstring },
};

export const keychain = new Head(new KB());
