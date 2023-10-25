import { Commit } from "../commit.ts";

export const PROTOCOL = "tribles/commit";

export function websocketLog(url: string): {
  push(commit: Commit): void;
  pull(): Promise<Commit>;
  close(): void;
} {
  const socket = new WebSocket(url, PROTOCOL);
  socket.binaryType = "arraybuffer";

  const commitQueue: Promise<Commit>[] = [];
  const awaitsQueue: {
    resolve: (commit: Commit) => void;
    reject: (error: Error) => void;
  }[] = [];

  socket.addEventListener("message", (e) => {
    let commit = undefined, error;
    try {
      const data = new Uint8Array(e.data);
      commit = Commit.deserialize(data);
    } catch (e) {
      error = e;
    }

    const promise = awaitsQueue.shift();
    if (promise === undefined) {
      if (commit === undefined) {
        commitQueue.push(Promise.reject(error));
      } else {
        commitQueue.push(Promise.resolve(commit));
      }
    } else {
      if (commit === undefined) {
        promise.reject(error);
      } else {
        promise.resolve(commit);
      }
    }
  });

  return {
    push(commit: Commit) {
      const data = commit.serialize();
      socket.send(data);
    },
    pull() {
      const commit = commitQueue.shift();
      if (commit === undefined) {
        return new Promise((resolve, reject) =>
          awaitsQueue.push({ resolve, reject })
        );
      }
      return commit;
    },
    close() {
      socket.close();
    },
  };
}
