const std = @import("std");
const mc = @import("./minicuckoo.zig");

const allocator = std.heap.page_allocator;
var global_secret : [16]u8 = undefined;

export fn _initialize() void {
    std.crypto.random.bytes(&global_secret);
}

// Memory
//
export fn alloc(len: usize) [*]u8 {
  const memory = allocator.allocAdvanced(u8, 64, len, std.mem.Allocator.Exact.exact) catch unreachable;
  return memory.ptr;
}

export fn free(mem: [*]u8, len: usize) void {
  allocator.free(mem[0..len]);
}


// Hash
//
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

const CuckooMap = mc.MiniCuckoo(4, u32);

export fn mini() void {
  var map = CuckooMap.init();
}


// Serialization
//

/// # Trible Txn
///                                                                      
/// ```
///      16 byte     8 byte  8 byte              32 byte                 
///         │           │       │                   │                    
///         │           │       │                   │                    
/// ┌──────────────┐┌──────┐┌──────┐┌──────────────────────────────┐     
/// ┌──────────────┐┌──────┐┌──────┐┌──────────────────────────────┐     
/// │     zero     ││ 0x1  ││      ││          public key          │     
/// └──────────────┘└──────┘└──────┘└──────────────────────────────┘     
///                     │       │                                        
///               tag───┘       │                                        
///                         txn size                                     
///                                                                      
///                                                                      
///                              64 byte                                 
///                                 │                                    
///                                 │                                    
/// ┌──────────────────────────────────────────────────────────────┐     
/// ┌──────────────────────────────────────────────────────────────┐     
/// │                          signature                           │     
/// └──────────────────────────────────────────────────────────────┘     
///                                                                      
///                                                                      
///                              64 byte                                 
///                                 │                                    
///                                 │                                    
/// ┌──────────────────────────────────────────────────────────────┐     
/// ┌──────────────┬┬──────────────┬┬──────────────────────────────┐*    
/// │    entity    ││  attribute   ││            value             │     
/// └──────────────┴┴──────────────┴┴──────────────────────────────┘     
///                                 │                                    
///                                 │                                    
///                              trible                                  
///                                                                      
/// ```

//const ParseResult = 
// !struct{[]u8, bool} {

export fn txn_header(data_ptr : [*]u8, len: usize) bool {
  const data = data_ptr[0..len];
  const zeroes = [_]u8{0} ** 16;
  return std.mem.eql(u8, data[0..16], zeroes[0..16]);
  //return .{};
}

///                                                                      
/// # Blob Txn                                         
///
/// ```
///                                              1 byte                  
///                                                 │                    
///      16 byte     8 byte  8 byte  8 byte  8 byte │    15 byte         
///         │           │       │       │       │   │       │            
///         │           │       │       │       │   │       │            
/// ┌──────────────┐┌──────┐┌──────┐┌──────┐┌──────┐│┌─────────────┐     
/// ┌──────────────┐┌──────┐┌──────┐┌──────┐┌──────┐╻┌─────────────┐     
/// │     zero     ││ 0x2  ││      ││      ││ path │┃│             │     
/// └──────────────┘└──────┘└──────┘└──────┘└──────┘╹└─────────────┘     
///                     │       │       │           │       │            
///               tag───┘       │       └┐          │       └───┐        
///                         txn size     │        depth         │        
///                                  blob size          local bookkeeping
///                                                                      
///                                                                      
///              32 byte                         32 byte                 
///                 │                               │                    
///                 │                               │                    
/// ┌──────────────────────────────┐┌──────────────────────────────┐     
/// ┌──────────────────────────────┐┌──────────────────────────────┐     
/// │          blob hash           ││          chunk hash          │     
/// └──────────────────────────────┘└──────────────────────────────┘     
///                                                                      
///                                                                      
/// 1 byte                       63 byte                                 
///    │                            │                                    
/// ┌──┘                            │                                    
/// │┌─────────────────────────────────────────────────────────────┐     
/// ╻┌─────────────────────────────────────────────────────────────┐*    
/// ┃│                        chunk-segment                        │     
/// ╹└─────────────────────────────────────────────────────────────┘     
/// │                                                                    
/// └───────┐                                                            
///         │                                                            
/// non-zero checksum                                                    
///
/// ```


// extern fn inc(a: i32) i32;