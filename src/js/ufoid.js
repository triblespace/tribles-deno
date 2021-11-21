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
  rotor: (() => {
    let a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a;
  })(),
  now(arr = new Uint8Array(16)) {
    return UFOID.withTime(Date.now(), arr);
  },

  withTime(time, arr = new Uint8Array(16)) {
    crypto.getRandomValues(arr.subarray(8, 16));
    const view = new DataView(arr.buffer);
    view.setUint32(0, time & 0xffffffff, false);
    view.setUint32(1, this.rotor[0]++, false);

    return arr;
  },

  validate(id) {
    if (id instanceof Uint8Array && id.length === 16) {
      for (const e of id) {
        if (e !== 0) return true;
      }
    }
    return false;
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
};
