import { FixedUint8Array, fixedUint8Array } from "../util.ts";

export class UFOID {
  data: FixedUint8Array<16>;

  constructor(data: FixedUint8Array<16>) {
    this.data = data;
  }

  static now(): UFOID {
    return UFOID.withTime(Date.now());
  }

  static withTime(time: number): UFOID {
    const data = fixedUint8Array(16);
    const view = new DataView(data.buffer);
    view.setUint32(0, time & 0xffffffff, false);
    crypto.getRandomValues(data.subarray(4, 16));

    return new UFOID(data);
  }

  static fromValue(b: FixedUint8Array<32>): UFOID {
    const a = new Uint32Array(b.buffer, b.byteOffset, 8);
    if (
      a[0] !== 0 ||
      a[1] !== 0 ||
      a[2] !== 0 ||
      a[3] !== 0
    ) {
      throw Error("invalid ufoid: value must be zero padded");
    }
    if (a[4] === 0 && a[5] === 0 && a[6] === 0 && a[7] !== 0) {
      throw Error("invalid ufoid: all zero (NIL) ufoid is not a valid value");
    }
    return new UFOID(b.slice(16, 32) as FixedUint8Array<16>);
  }

  static fromHex(str: string): UFOID {
    const data = fixedUint8Array(16);
    for (let i = 0; i < 16; i += 1) {
      data[i] = parseInt(str.substr(i * 2, 2), 16);
    }
    return new UFOID(data);
  }

  toHex(): string {
    return Array.from(this.data).map((byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("");
  }

  toUint32Array(): Uint32Array {
    return new Uint32Array(this.data.buffer, 0, 4);
  }

  toId(): FixedUint8Array<16> {
    return this.data.slice() as FixedUint8Array<16>;
  }

  toValue(b: FixedUint8Array<32> = fixedUint8Array(32)): FixedUint8Array<32> {
    b.subarray(0, 16).fill(0);
    b.subarray(16, 32).set(this.data);
    return b;
  }
}

// Schema
function encoder(v: UFOID, b: FixedUint8Array<32>): Uint8Array | undefined {
  v.toValue(b);
  return undefined;
}

function decoder(b: FixedUint8Array<32>, _blob: Uint8Array | undefined) {
  return UFOID.fromValue(b);
}

function factory(): UFOID {
  return UFOID.now();
}

export const schema = {
  encoder,
  decoder,
  factory,
};
