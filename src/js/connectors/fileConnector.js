async function connect(tribles_path, blobs_path) {
  const tribles_file = await Deno.open(tribles_path, {
    read: true,
    write: true,
  });
  const blobs_file = await Deno.open(blobs_path, { read: true, write: true });

  return new FileRemote(tribles_file, blobs_file);
}

class FileRemote {
  constructor(
    tribles_file,
    blobs_file,
  ) {
    this.tribles_file = tribles_file;
    this.blobs_file = blobs_file;
  }

  blobcache() {
  }
}
