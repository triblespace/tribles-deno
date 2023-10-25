export function filterInPlace<T>(arr: T[], filter: (value: T) => boolean) {
  let next = 0;

  for (const value of arr) {
    if (filter(value)) {
      arr[next++] = value;
    }
  }
  arr.splice(next);
}

export type FixedUint8Array<L extends number> = Uint8Array & { length: L };

export function fixedUint8Array<L extends number>(
  length: L,
): FixedUint8Array<L> {
  return new Uint8Array(length) as FixedUint8Array<L>;
}

export const assert = (test: boolean, message: string) => {
  if (!test) {
    throw Error(message);
  }
};
