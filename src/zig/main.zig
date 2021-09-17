const std = @import("std");

var global_secret : [16]u8 = undefined;

export fn _initialize() void {
    std.crypto.random.bytes(&global_secret);
}

export fn secret(i : i32) i32 {
    return global_secret[@intCast(usize, i)];
}

export var global_hash_input : [64]u8 = undefined;
export var global_hash_output : [16]u8 = undefined;

export fn run_hash(len: i32) void {
  const siphash = std.hash.SipHash128(2, 4);
  siphash.create(&global_hash_output, global_hash_input[0..@intCast(usize, len)], global_secret[0..]);
}

// extern fn inc(a: i32) i32;
//
// export fn addInc(a: i32, b: i32) i32 {
//     return inc(a) + b;
// }
// 
// 
// #[wasm_bindgen]
// pub fn hash_equal(l: &[u8], r: &[u8]) -> bool {
//   return l == r;
// }
// 
// #[wasm_bindgen]
// pub fn hash_combine(l: &[u8], r: &[u8]) -> Vec<u8> {
//   return (0..HASH_SIZE).map(|i| l[i]^r[i]).collect();
// }
// 
// #[wasm_bindgen]
// pub fn hash_update(combined: &[u8], old_hash: &[u8], new_hash: &[u8]) -> Vec<u8> {
//   return (0..HASH_SIZE).map(|i| combined[i]^old_hash[i]^new_hash[i]).collect();
// }
