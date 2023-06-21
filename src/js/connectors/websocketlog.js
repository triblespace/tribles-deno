import { Commit } from "../commit.js";

export const PROTOCOL = "tribles/commit";

function websocketLog(url) {
  const socket = new WebSocket(url, PROTOCOL)
  socket.binaryType = "arraybuffer";

  const commitQueue = [];
  const awaitsQueue = [];

  socket.addEventListener("message", (e) => {
    let commit, error, success;
    try {
      const data = new Uint8Array(e.data);
      commit = Commit.deserialize(data);
      success = true;
    } catch (e) {
      error = e;
      success = false;
    }

    let promise;
    if(promise = awaitsQueue.shift()) {
      if(success) {
        promise.resolve(commit);
      } else {
        promise.reject(error);
      }
    } else {
      if(success) {
        commitQueue.push(Promise.resolve(commit));
      } else {
        commitQueue.push(Promise.reject(error));
      }
    }
  });

  const push = (commit) => {
    const data = commit.serialize();
    socket.send(data)
  }

  const pull = async () => {
    let commit;
    if(commit = commitQueue.shift()) {
      return commit;
    } else {
      return new Promise((resolve, reject) => awaitsQueue.push({resolve, reject}));
    }
  }

  const close = () => {
    socket.close()
  }

  return { push,
           pull,
           close,
           socket };
}

export { websocketLog };
