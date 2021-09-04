#![feature(array_methods)]
use wasm_bindgen::prelude::*;
use xxhash_rust::xxh3::xxh3_128_with_secret;

const HASH_SIZE: usize = 16;

#[wasm_bindgen]
pub fn xxh_digest(input: &[u8], secret: &[u8]) -> Vec<u8> {
  return xxh3_128_with_secret(input, secret).to_be_bytes().as_slice().to_vec();
}

#[wasm_bindgen]
pub fn hash_equal(l: &[u8], r: &[u8]) -> bool {
  return l == r;
}

#[wasm_bindgen]
pub fn hash_combine(l: &[u8], r: &[u8]) -> Vec<u8> {
  return (0..HASH_SIZE).map(|i| l[i]^r[i]).collect();
}

#[wasm_bindgen]
pub fn hash_update(combined: &[u8], old_hash: &[u8], new_hash: &[u8]) -> Vec<u8> {
  return (0..HASH_SIZE).map(|i| combined[i]^old_hash[i]^new_hash[i]).collect();
}
