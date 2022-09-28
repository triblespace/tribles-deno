const std = @import("std");
const blaked25519 = @import("./zig-ed25519-blake2b/d25519-blake2b.zig").Ed25519Blake2b;

const Blake2b256 = std.crypto.hash.blake2.Blake2b256;

// # Hash
export var global_hash_secret : [16]u8 = [_]u8{0} ** 16;
export var global_hash_this : [16]u8 = [_]u8{0} ** 16;
export var global_hash_other : [16]u8 = [_]u8{0} ** 16;
export var global_hash_data : [64]u8 = [_]u8{0} ** 64;

export fn hash_digest(len: usize) void {
  const siphash = comptime std.hash.SipHash128(2, 4);
  siphash.create(&global_hash_this, global_hash_data[0..len], global_hash_secret[0..]);
}

export fn hash_xor() void {
    for(global_hash_other) |other, i| {
        global_hash_this[i] ^= other;
    }
}

export fn hash_equal() bool {
    return std.mem.eql(u8, &global_hash_this, &global_hash_other);
}


// # Blake2b256

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

// # Commits
//
//      16 byte                 32 byte
//         │                       │
// ┌──────────────┐┌──────────────────────────────┐
// ┌──────────────┐┌──────────────────────────────┐┌──────────────┐
// │     zero     ││          public key          ││  signature   │
// └──────────────┘└──────────────────────────────┘└──────────────┘
//                                                 └──────────────┘
//                         ┌───────────────────────────────┘
//                      64 byte                         16 byte
//                         │                               │
// ┌──────────────────────────────────────────────┐┌──────────────┐
// ┌──────────────────────────────────────────────┐┌──────────────┐
// │                  signature                   ││  commit id   │
// └──────────────────────────────────────────────┘└──────────────┘
//
//                              64 byte
//                                 │
// ┌──────────────────────────────────────────────────────────────┐
// ┌──────────────┬┬──────────────┬┬──────────────────────────────┐*
// │    entity    ││  attribute   ││            value             │
// └──────────────┴┴──────────────┴┴──────────────────────────────┘
//                                 │
//                              trible

pub const commit_header_size = 128;
/// This limit enforces compatibility with UDP, DDS, WebRTC and friends.
/// Since the entire datamodel is build on calm consistency there is no
/// real need for large "transactions" except for metadata austerity.
pub const commit_max_trible_count = 1020;
const trible_size = 64;
pub const commit_max_size = commit_header_size + (commit_max_trible_count * trible_size);

export var global_commit_secret : [blaked25519.seed_length]u8 = [_]u8{0} ** blaked25519.seed_length;
export var global_commit_buffer : [commit_max_size]u8 = [_]u8{0} ** commit_max_size;



fn pubkey() [32]u8 {
  return global_commit_buffer[16..48];
}

fn signature() [64]u8 {
  return global_commit_buffer[48..112];
}

fn check_structure(commit_length: usize) bool {
  // Commits must at least contain one trible.
  if(commit_length < commit_header_size + trible_size) return false;
  // Commits must include at most 1020 tribles to fit into UDP, DDS, RTC, ...
  if(commit_max_size < commit_length) return false;
  // Commit length must be a multiple of the trible size.
  if((commit_length % trible_size) != 0) return false;
  // Commits must start with a frame marker.
  if(!std.mem.allEqual(u8, global_commit_buffer[0..16], 0)) return false;
  // Commits may not contain other frame markers.
  var i: usize = trible_size;
  while(i < commit_length):(i += trible_size){
      if(std.mem.allEqual(u8, global_commit_buffer[i..i+trible_size], 0)) return false;
  }

  return true;
}

pub fn commit_verify(commit_length: usize) bool {
  check_structure(commit_length) or return false;
  const msg = global_commit_buffer[112..commit_length];
  blaked25519.verify(signature(), msg, pubkey()) catch return false;
  return true;
}

pub fn commit_sign(trible_count: usize) bool {
  const commit_length = trible_count * trible_size;
  check_structure(commit_length) or return false;
  const key_pair = blaked25519.KeyPair.create(global_commit_secret) catch return false;
  std.mem.set(u8, global_commit_buffer[0..16], 0);
  std.mem.copy(u8, global_commit_buffer[16..48], key_pair.public_key[0..]);
  std.mem.copy(u8, global_commit_buffer[112..128], commit_id[0..]);

  const msg = global_commit_buffer[112..commit_length];
  const sig = blaked25519.sign(msg, key_pair, null) catch return false;
  std.mem.copy(u8, global_commit_buffer[48..112], sig[0..]);

  return true;
}