import { TRIBLE_SIZE, VALUE_SIZE } from "./trible.js";
import {emptyValuePACT}from "./pact.js";

const TRIBLES_PROTOCOL = "tribles";

export function filterTrustedPolicy(publicKeys, inbox) {
	const keyIndex = publicKeys.reduce((pact, key) => pact.put(key), emptyValuePACT);
	return ({publicKey, kb}) => {
		
	}
}

class WSConnector extends EventTarget {
	  constructor(addr) {
		super();
		this.addr = addr;
		this.ws = new WebSocket(addr, TRIBLES_PROTOCOL);
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
  }
	addEventListener(message)
	  async open() {

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
		const message = new Uint8Array(e.data);
	
		this.inbox.commit((kb) => kb.withTribles(contiguousTribles(txnPayload)));
	  }
	
	  async close() {
		this.ws.close();
		await this.ws.closePromise;
		return this;
	  }
	  
	  async send(kb) {
		  
	  }
	}
	
	export {WSConnector}