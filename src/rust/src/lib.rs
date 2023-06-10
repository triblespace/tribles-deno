use std::mem::MaybeUninit;
use std::hash::Hasher;
use siphasher::sip128::{Hasher128, SipHasher24};

//PACT hash

#[no_mangle]
pub static mut global_hash_secret : [u8; 16] = [0; 16];
#[no_mangle]
pub static mut global_hash_this : [u8; 16] = [0; 16];
#[no_mangle]
pub static mut global_hash_other : [u8; 16] = [0; 16];
#[no_mangle]
pub static mut global_hash_data : [u8; 64] = [0; 64];

#[no_mangle]
pub extern fn hash_digest(len: usize) {
    unsafe {
        let mut hasher = SipHasher24::new_with_key(&global_hash_secret);
        hasher.write(&global_hash_data[0..len]);
        global_hash_this = hasher.finish128().as_bytes(); 
    }
}

#[no_mangle]
pub extern fn hash_xor() {
    unsafe {
        for i in 0..16 {
            global_hash_this[i] ^= global_hash_other[i];
        }
    }
}

#[no_mangle]
pub extern fn hash_equal() -> bool {
    unsafe {
        global_hash_this == global_hash_other
    }
}

// Blake3

#[no_mangle]
pub static mut global_blake3_out : [u8; 32] = [0; 32];
#[no_mangle]
pub static mut global_blake3_buffer : [u8; 16384] = [0; 16384];

static mut BLAKE3_STATE : MaybeUninit<blake3::Hasher> = MaybeUninit::uninit();

#[no_mangle]
pub extern fn blake3_init() {
    unsafe{
        BLAKE3_STATE = MaybeUninit::new(blake3::Hasher::new());
    }
}

#[no_mangle]
pub extern fn blake3_update(len: usize) {
    unsafe {
        BLAKE3_STATE.assume_init_mut().update(&global_blake3_buffer[0..len]);
    }
}

#[no_mangle]
pub extern fn blake3_finish() {
    unsafe {
        global_blake3_out = BLAKE3_STATE.assume_init_mut().finalize().into();
    }
}

#[no_mangle]
pub extern fn blake3_deinit() {
    unsafe {
        BLAKE3_STATE.assume_init_drop();
    }
}
