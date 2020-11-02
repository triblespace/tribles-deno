const id = ({
  encoder: (v, b) => {
    b.fill(0, 0, b.length - 16);
    b.set(uuid.parse(v), b.length - 16);
    return null;
  },
  decoder: (b, blob) => {
    return uuid.stringify(b, b.length - 16);
  },
});
