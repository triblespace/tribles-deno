import { TRIBLE_SIZE, VALUE_SIZE } from "./trible.js";
import { emptyValuePACT } from "./pact.js";

export const PROTOCOL = "tribles/commit";

function wsTribleConnector(ws, inHandler) {
  ws.binaryType = "arraybuffer";
  ws.addEventListener("message", (e) => {
    const message = new Uint8Array(e.data);
    this.inbox.commit((kb) =>
      kb.with({ tribles: contiguousTribles(txnPayload) })
    );
  });
  return async (txn) => {
    if (!change.commitKB.isEmpty()) {
      const transaction = change.commitKB.tribleset.dump();
      await change.commitKB.blobcache.flush();
      this.ws.send(transaction);
    }
  };
}

export { wsTribleConnector };
