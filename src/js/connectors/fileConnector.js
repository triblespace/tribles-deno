import {serialize, deserialize } from "./serde.js";

async function loadTribles(path) {
  const file = await Deno.open(path, {
    read: true,
    write: false,
  });
  
  for await (const chunk of file.readable) {
    console.log(decoder.decode(chunk));
  }
}

async function storeTribles(path, middleware = (commit) => [commit]) {
  const file = await Deno.open(path, {
    read: false,
    append: true,
    create: true,
  });

  return ({
    close: () => file.close(),
    middleware: async function*(commit) {
      const writer = file.writable.getWriter();
      for await (const commit of middleware(commit)) {
       await writer.write(serialize(commit.commitKB.tribleset, commit.commitId));
       yield commit;
      }
    }
  });
}
