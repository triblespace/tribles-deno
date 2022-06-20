const std = @import("std");

const Blake2b256 = std.crypto.hash.blake2.Blake2b256;

// Hash
export var global_secret : [16]u8 = [_]u8{0} ** 16;
export var global_hash_this : [16]u8 = [_]u8{0} ** 16;
export var global_hash_other : [16]u8 = [_]u8{0} ** 16;
export var global_hash_data : [64]u8 = [_]u8{0} ** 64;

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


// Blake2b

export var global_blake2b256_out : [32]u8 = [_]u8{0} ** 32;
export var global_blake2b256_buffer : [1024]u8 = [_]u8{0} ** 1024;
var blake2b256_state : Blake2b256 = Blake2b256.init(.{});


export fn blake2b256_update(len: usize) void {
  blake2b256_state.update(global_blake2b256_buffer[0..len]);
}

export fn blake2b256_finish() void {
  blake2b256_state.final(global_blake2b256_out[0..]);
  blake2b256_state = Blake2b256.init(.{});
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
