class ufoidSequence {
  constructor() {}

  [Symbol.iterator]() {
    return this;
  }
  next() {
    return { value: UFOID.now() };
  }
}

export const UFOID = {
  now(arr = new Uint8Array(32)) {
    return UFOID.withTime(Date.now(), arr);
  },

  withTime(time, arr = new Uint8Array(32)) {
    const view = new DataView(arr.buffer);
    view.setUint32(0, 0, false);
    view.setUint32(4, 0, false);
    view.setUint32(8, 0, false);
    view.setUint32(12, 0, false);
    view.setUint32(16, time & 0xffffffff, false);
    crypto.getRandomValues(arr.subarray(20, 32));

    return arr;
  },

  validate(id) {
    if (!(id instanceof Uint8Array && id.length === 32)) return false;
    const a = new Uint32Array(id.buffer, id.byteOffset, 8);
    return (
      a[0] === 0 &&
      a[1] === 0 &&
      a[2] === 0 &&
      a[3] === 0 &&
      (a[4] !== 0 || a[5] !== 0 || a[6] !== 0 || a[7] !== 0)
    );
  },

  anon() {
    return new ufoidSequence();
  },

  namedCache() {
    return new Proxy(
      {},
      {
        get: function (o, attr) {
          if (!(typeof attr === "string" || attr instanceof String)) {
            return undefined;
          }

          if (attr in o) {
            return o[attr];
          }

          const id = UFOID.now();
          Object.defineProperty(o, attr, {
            value: id,
            writable: false,
            configurable: false,
            enumerable: true,
          });
          return id;
        },
        set: function (_, attr) {
          throw TypeError("Error: Named UFOID cache is not writable.");
        },
        deleteProperty: function (_, attr, value) {
          throw TypeError("Error: Named UFOID cache is not writable.");
        },
        setPrototypeOf: function (_) {
          throw TypeError("Error: Named UFOID cache is not writable.");
        },
        isExtensible: function (_) {
          return true;
        },
        preventExtensions: function (_) {
          return false;
        },
        defineProperty: function (_, attr) {
          throw TypeError("Error: Named UFOID cache is not writable.");
        },
      }
    );
  },

  fromHex(str) {
    let bytes = new Uint8Array(32);
    for (let i = 0; i < 16; i += 1)
      bytes[16+i] = parseInt(str.substr(i*2, 2), 16);
    return bytes;
  },

  toHex(id) {
    return Array.from(id.subarray(16, 32)).map(byte => byte.toString(16).padStart(2, "0")).join('');
  }
};

// Schema

function ufoidEncoder(v, b) {
  if (!UFOID.validate(v)) {
    throw Error(`Provided value is not an encodable ufoid:${v}`);
  }
  b.set(v);
  return null;
}

function ufoidDecoder(b, blob) {
  return b;
}

export const schema = {
  encoder: ufoidEncoder,
  decoder: ufoidDecoder,
  factory: UFOID.now,
};
