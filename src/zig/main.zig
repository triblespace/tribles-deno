const std = @import("std");
//const mc = @import("./pact.zig");

const allocator = std.heap.page_allocator;
var global_secret : [16]u8 = undefined;

// Hash
//
export fn setSecret(i : i32, v : i32) void {
    global_secret[@intCast(usize, i)] = @intCast(u8, v);
}

export fn secret(i : i32) i32 {
    return global_secret[@intCast(usize, i)];
}

export var global_hash_this : [16]u8 = undefined;
export var global_hash_other : [16]u8 = undefined;
export var global_hash_data : [64]u8 = undefined;

export fn hash_digest(len: usize) void {
  const siphash = comptime std.hash.SipHash128(2, 4);
  siphash.create(&global_hash_this, global_hash_data[0..len], global_secret[0..]);
}

export fn hash_xor() void {
    for(global_hash_other) |other, i| {
        global_hash_this[i] ^= other;
    }
}

export fn hash_equal() bool {
    return std.mem.eql(u8, &global_hash_this, &global_hash_other);
}

// # Serialization
// ```
// ## Trible Txns
//
//       16 byte     8 byte  8 byte              32 byte
//          │           │       │                   │
//          │           │       │                   │
//  ┌──────────────┐┌──────┐┌──────┐┌──────────────────────────────┐
//  ┌──────────────┐┌──────┐┌──────┐┌──────────────────────────────┐
//  │     zero     ││ tag  ││      ││          public key          │
//  └──────────────┘└──────┘└──────┘└──────────────────────────────┘
//                              │
//                              │
//                          txn size
//
//
//                               64 byte
//                                  │
//                                  │
//  ┌──────────────────────────────────────────────────────────────┐
//  ┌──────────────────────────────────────────────────────────────┐
//  │                          signature                           │
//  └──────────────────────────────────────────────────────────────┘
//
//
//                               64 byte
//                                  │
//                                  │
//  ┌──────────────────────────────────────────────────────────────┐
//  ┌──────────────┬┬──────────────┬┬──────────────────────────────┐*
//  │    entity    ││  attribute   ││            value             │
//  └──────────────┴┴──────────────┴┴──────────────────────────────┘
//                                  │
//                                  │
//                               trible
// ```
//
//
// ## Blob Txns
//
// ```
//       16 byte     8 byte  8 byte  8 byte  8 byte      15 byte
//          │           │       │       │       │           │
//          │           │       │       │       │           │
//  ┌──────────────┐┌──────┐┌──────┐┌──────┐┌──────┐ ┌─────────────┐
//  ┌──────────────┐┌──────┐┌──────┐┌──────┐┌──────┐╻┌─────────────┐
//  │     zero     ││ tag  ││      ││      ││ path │┃│             │
//  └──────────────┘└──────┘└──────┘└──────┘└──────┘╹└─────────────┘
//                              │       │           │       │
//                              │       └┐          │       └───┐
//                          txn size     │        depth         │
//                                   blob size          local bookkeeping
//
//
//               32 byte                         32 byte
//                  │                               │
//                  │                               │
//  ┌──────────────────────────────┐┌──────────────────────────────┐
//  ┌──────────────────────────────┐┌──────────────────────────────┐
//  │          blob hash           ││          chunk hash          │
//  └──────────────────────────────┘└──────────────────────────────┘
//
//
//  1 byte                       63 byte
//     │                            │
//  ┌──┘                            │
//  │┌─────────────────────────────────────────────────────────────┐
//  ╻┌─────────────────────────────────────────────────────────────┐*
//  ┃│                        chunk-segment                        │
//  ╹└─────────────────────────────────────────────────────────────┘
//  │
//  └───────┐
//          │
//  non-zero checksum
// ```
