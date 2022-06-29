import { TRIBLE_SIZE, VALUE_SIZE } from "./trible.js";
import {emptyValuePACT}from "./pact.js";

export const PROTOCOL = "triblesTXN";

export function filterTrustedPolicy(publicKeys, inbox) {
	const keyIndex = publicKeys.reduce((pact, key) => pact.put(key), emptyValuePACT);
	return ({publicKey, kb}) => {
		
	}
}

function wsTribleConnector(ws, inHandler){
	ws.binaryType = "arraybuffer";
	ws.addEventListener("message", (e) => {
		const message = new Uint8Array(e.data);
		this.inbox.commit((kb) => kb.withTribles(contiguousTribles(txnPayload)));
	});
	return async (txn) => {
		if (!change.difKB.isEmpty()) {
			const transaction = change.difKB.tribleset.dump();
			await change.difKB.blobcache.flush();
			this.ws.send(transaction);
		  }
	};
}
	
	export {wsTribleConnector}