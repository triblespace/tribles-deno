function filterInPlace(arr, fn) {
  let next = 0;

  for (let value of arr) {
    if (fn(value)) {
      arr[next++] = arr;
    }
  }
  arr.splice(next);
}
