import { TRIBLE_SIZE, VALUE_SIZE } from "./trible.js";
import {emptyValuePACT}from "./pact.js";

const TRIBLES_PROTOCOL = "tribles";

export function filterTrustedPolicy(publicKeys, inbox) {
	const keyIndex = publicKeys.reduce((pact, key) => pact.put(key), emptyValuePACT);
	return ({publicKey, kb}) => {
		
	}
}

class WSConnector {
	  constructor(addr) {
		this.addr = addr;
		this.ws = null;
		this.outbox = outbox;
		this.inbox = inbox;
	  }
	  async open() {
		this.ws = new WebSocket(this.addr, TRIBLES_PROTOCOL);
		this.ws.binaryType = "arraybuffer";
		this.ws.addEventListener("open", (e) => {
		  console.info(`Connected to ${this.addr}.`);
		});
		this.ws.addEventListener("message", (e) => {
		  this._onMessage(e);
		});
		this.ws.addEventListener("close", (e) => {
		  console.info(`Disconnected from ${this.addr}.`);
		});
		this.ws.addEventListener("error", (e) => {
		  console.error(`Error on connection to ${this.addr}: ${e.message}`);
		});
		const openPromise = new Promise((resolve, reject) => {
		  this.ws.addEventListener("open", resolve);
		  this.ws.addEventListener("close", reject);
		});
		const closePromise = new Promise((resolve, reject) => {
		  this.ws.addEventListener("close", resolve);
		});
		this.ws.openPromise = openPromise;
		this.ws.closePromise = closePromise;
	
		await openPromise;
	
		return this;
	  }
	
	  async transfer() {
		const changeIterator = this.outbox.changes();
		while (true) {
		  const { change, close } = await Promise.race([
			changeIterator.next().then(({ value }) => ({ change: value })),
			this.ws.closePromise.then(() => ({ close: true })),
		  ]);
		  if (close) {
			return;
		  }
		  if (!change.difKB.isEmpty()) {
			const transaction = change.difKB.tribleset.dump();
			await change.difKB.blobcache.flush();
			this.ws.send(transaction);
		  }
		}
	  }
	
	  _onMessage(e) {
		const txn = new Uint8Array(e.data);
		if (txn.length <= MARKER_SIZE) {
		  console.warn(`Bad transaction, too short.`);
		  return;
		}
		if (txn.length % TRIBLE_SIZE !== 0) {
		  console.warn(
			`Bad transaction, ${txn.length} is not a multiple of ${TRIBLE_SIZE}.`
		  );
		  return;
		}
		const txnMarker = txn.subarray(0, MARKER_SIZE);
		if (!isTransactionMarker(txnMarker)) {
		  console.warn(`Bad transaction, doesn't begin with transaction marker.`);
		  return;
		}
	
		const txnPayload = txn.subarray(TRIBLE_SIZE);
		const txnHash = blake2s32(txnPayload, new Uint8Array(32));
		if (!isValidTransaction(txnMarker, txnHash)) {
		  console.warn("Bad transaction, hash does not match.");
		  return;
		}
	
		this.inbox.commit((kb) => kb.withTribles(contiguousTribles(txnPayload)));
	  }
	
	  async close() {
		this.ws.close();
		await this.ws.closePromise;
		return this;
	  }
	  
	  subscribe(credentials, subscription) {
		  
	  }
	  
	  aync send() {
		  
	  }
	}
	
	export {WSConnector}