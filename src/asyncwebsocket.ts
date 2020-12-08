// Code from https://github.com/denoland/deno/pull/7450/files

export class AsyncWebSocket extends WebSocket {
  #readable: ReadableStream<Event>;

  constructor(url: string, protocols?: string | string[]) {
    super(url, protocols);
    this.binaryType = "arraybuffer";

    const { readable, writable } = new TransformStream<Event, Event>();
    this.#readable = readable;
    const writer = writable.getWriter();

    this.addEventListener("open", (e) => {
      writer.write(e);
    });
    this.addEventListener("message", (e) => {
      writer.write(e);
    });
    this.addEventListener("close", async (e) => {
      await writer.write(e);
      await writer.close();
    });
    this.addEventListener("error", (e) => {
      writer.write(e);
    });
  }

  async *[Symbol.asyncIterator]() {
    yield* this.#readable.getIterator();
  }
}
