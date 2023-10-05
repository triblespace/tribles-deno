export function filterInPlace<T>(arr: T[], filter: (value: T) => boolean) {
  let next = 0;

  for (const value of arr) {
    if (filter(value)) {
      arr[next++] = value;
    }
  }
  arr.splice(next);
}
