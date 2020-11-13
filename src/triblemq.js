import { TribleKB } from "./triblekb.js";

class TribleMQ {
  constructor(
    { hostname = "localhost", port = 80 },
    inbox = new TribleKB(),
    outbox = new TribleKB(),
  ) {
    this.hostname = hostname;
    this.port = port;
    this.connection = null;
    this._inbox = inbox;
    this._outbox = outbox;
  }

  async connect() {
    if (!this.connection) {
      this.connection = await Deno.connect(
        { hostname: this.hostname, port: this.port, transport: "tcp" },
      );
    }
    return this;
  }

  get inbox() {
    return this._inbox;
  }

  get outbox() {
    return this._outbox;
  }

  set outbox(outbox_value) {
    const new_tribles = this._outbox.db.difference(outbox_value.db);
    this._outbox = outbox_value;
  }
}
