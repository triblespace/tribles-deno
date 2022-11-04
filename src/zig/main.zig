const std = @import("std");
const ed25519 =  std.crypto.sign.Ed25519;
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
// │                  signature                   ││   meta id    │
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

pub const serialize_header_size = 128;
/// This limit enforces compatibility with UDP, DDS, WebRTC and friends.
/// Since the entire datamodel is build on calm consistency there is no
/// real need for large "transactions" except for metadata austerity.
pub const serialize_max_trible_count = 1020;
const trible_size = 64;
pub const serialize_max_size = serialize_header_size + (serialize_max_trible_count * trible_size);

export var global_serialize_secret : [ed25519.seed_length]u8 = [_]u8{0} ** ed25519.seed_length;
export var global_serialize_buffer : [serialize_max_size]u8 = [_]u8{0} ** serialize_max_size;



fn pubkey() [32]u8 {
  return global_serialize_buffer[16..48];
}

fn signature() [64]u8 {
  return global_serialize_buffer[48..112];
}

fn check_structure(serialize_length: usize) bool {
  // Commits must at least contain one trible.
  if(serialize_length < serialize_header_size + trible_size) return false;
  // Commits must include at most 1020 tribles to fit into UDP, DDS, RTC, ...
  if(serialize_max_size < serialize_length) return false;
  // Commit length must be a multiple of the trible size.
  if((serialize_length % trible_size) != 0) return false;
  // Commits must start with a frame marker.
  if(!std.mem.allEqual(u8, global_serialize_buffer[0..16], 0)) return false;
  // Commits may not contain other frame markers.
  var i: usize = trible_size;
  while(i < serialize_length):(i += trible_size){
      if(std.mem.allEqual(u8, global_serialize_buffer[i..i+trible_size], 0)) return false;
  }

  return true;
}

pub fn verify(length: usize) bool {
  check_structure(length) or return false;
  
  var digest: [Blake2b256.digest_length]u8 = undefined;
  Blake2b256.hash(global_serialize_buffer[112..length], &digest, .{});

  ed25519.verify(signature(), digest, pubkey()) catch return false;
  return true;
}

pub fn sign(trible_count: usize) bool {
  const length = trible_count * trible_size;
  check_structure(length) or return false;
  const key_pair = ed25519.KeyPair.create(global_serialize_secret) catch return false;
  std.mem.set(u8, global_serialize_buffer[0..16], 0);
  std.mem.copy(u8, global_serialize_buffer[16..48], key_pair.public_key[0..]);
  
  var digest: [Blake2b256.digest_length]u8 = undefined;
  Blake2b256.hash(global_serialize_buffer[112..length], &digest, .{});

  const sig = ed25519.sign(digest, key_pair, null) catch return false;

  std.mem.copy(u8, global_serialize_buffer[48..112], sig[0..]);

  return true;
}