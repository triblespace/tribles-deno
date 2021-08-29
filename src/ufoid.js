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
  now() {
    return UFOID.withTime(Date.now());
  },

  withTime(time) {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr.subarray(4, 16));
    new DataView(arr.buffer).setUint32(0, time & 0xffffffff, false);
    return [...arr].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  },

  validate(id) {
    return /[0-9A-Fa-f]{16}/g.test(id);
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
