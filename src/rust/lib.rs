#![feature(array_methods)]
use wasm_bindgen::prelude::*;
use xxhash_rust::xxh3::xxh3_128_with_secret;

use nom::number::complete::be_u64;
use nom::multi::length_value;
use nom::bytes::complete::tag;

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

/// # Serialization
/// ```
/// ## Trible Txns
///
///       16 byte     8 byte  8 byte              32 byte
///          │           │       │                   │
///          │           │       │                   │
///  ┌──────────────┐┌──────┐┌──────┐┌──────────────────────────────┐
///  ┌──────────────┐┌──────┐┌──────┐┌──────────────────────────────┐
///  │     zero     ││ tag  ││      ││          public key          │
///  └──────────────┘└──────┘└──────┘└──────────────────────────────┘
///                              │
///                              │
///                          txn size
///
///
///                               64 byte
///                                  │
///                                  │
///  ┌──────────────────────────────────────────────────────────────┐
///  ┌──────────────────────────────────────────────────────────────┐
///  │                          signature                           │
///  └──────────────────────────────────────────────────────────────┘
///
///
///                               64 byte
///                                  │
///                                  │
///  ┌──────────────────────────────────────────────────────────────┐
///  ┌──────────────┬┬──────────────┬┬──────────────────────────────┐*
///  │    entity    ││  attribute   ││            value             │
///  └──────────────┴┴──────────────┴┴──────────────────────────────┘
///                                  │
///                                  │
///                               trible
/// ```
///

const TRIBLE_SIZE: usize = 64;
const VALUE_SIZE: usize = 32;
const MARKER_SIZE: usize = 128;

fn txn_header(s: &[u8]) -> IResult<&[u8], &[u8]> {
  length_value(be_u64, tag([0u8; 16]))(s)
}

fn txn<'a, F: 'a, O, E: ParseError<&'a str>>(inner: F) -> impl FnMut(&'a [u8]) -> IResult<&'a [u8], O, E>
  where
  F: Fn(&'a [u8]) -> IResult<&'a [u8], O, E>,
{
  delimited(
    multispace0,
    inner,
    multispace0
  )
}

pub fn txn<I, O, N, E, F>(mut f: F) -> impl FnMut(I) -> IResult<I, O, E>
where
  I: Clone + InputLength + InputTake,
  N: ToUsize,
  F: Parser<I, N, E>,
  E: ParseError<I>,
{
  move |i: I| {
    let (i, length) = f.parse(i)?;

    let length: usize = length.to_usize();

    if let Some(needed) = length
      .checked_sub(i.input_len())
      .and_then(NonZeroUsize::new)
    {
      Err(Err::Incomplete(Needed::Size(needed)))
    } else {
      let (rest, i) = i.take_split(length);
      match g.parse(i.clone()) {
        Err(Err::Incomplete(_)) => Err(Err::Error(E::from_error_kind(i, ErrorKind::Complete))),
        Err(e) => Err(e),
        Ok((_, o)) => Ok((rest, o)),
      }
    }
  }
}

#[wasm_bindgen]
pub fn serialize_tribles_txn(tribles: Vec<&[u8]>, privateKey: &[u8]) -> Vec<u8> {
  
}

#[wasm_bindgen]
pub fn deserialize_tribles_txn(tribles: Vec<&[u8]>, privateKey: &[u8]) -> Vec<u8> {
  
}

///
/// ## Blob Txns
///
/// ```
///       16 byte     8 byte  8 byte  8 byte  8 byte      15 byte
///          │           │       │       │       │           │
///          │           │       │       │       │           │
///  ┌──────────────┐┌──────┐┌──────┐┌──────┐┌──────┐ ┌─────────────┐
///  ┌──────────────┐┌──────┐┌──────┐┌──────┐┌──────┐╻┌─────────────┐
///  │     zero     ││ tag  ││      ││      ││ path │┃│             │
///  └──────────────┘└──────┘└──────┘└──────┘└──────┘╹└─────────────┘
///                              │       │           │       │
///                              │       └┐          │       └───┐
///                          txn size     │        depth         │
///                                   blob size          local bookkeeping
///
///
///               32 byte                         32 byte
///                  │                               │
///                  │                               │
///  ┌──────────────────────────────┐┌──────────────────────────────┐
///  ┌──────────────────────────────┐┌──────────────────────────────┐
///  │          blob hash           ││          chunk hash          │
///  └──────────────────────────────┘└──────────────────────────────┘
///
///
///  1 byte                       63 byte
///     │                            │
///  ┌──┘                            │
///  │┌─────────────────────────────────────────────────────────────┐
///  ╻┌─────────────────────────────────────────────────────────────┐*
///  ┃│                        chunk-segment                        │
///  ╹└─────────────────────────────────────────────────────────────┘
///  │
///  └───────┐
///          │
///  non-zero checksum
/// ```
///

