const std = @import("std");

const allocator = std.heap.page_allocator;

const ByteBitset = std.StaticBitSet(256);

const Hash_LUT = [256]u8;

fn random_choice(set: ByteBitset) ?u8 {
    if(set.count() == 0) return null;

    var possible_values: [256]u8 = undefined;
    var possible_values_len: usize = 0;

    var iter = set.iterator(.{});
    while (iter.next()) |b| {
        possible_values[possible_values_len] = @intCast(u8, b);
        possible_values_len += 1;
    }

    const rand_index: u8 = @intCast(u8, std.crypto.random.uintLessThan(usize, possible_values_len));
    return possible_values[rand_index];
}

fn generate_hash_LUT_helper(dependencies: []const Hash_LUT, i: usize, remaining: ByteBitset, lut: *Hash_LUT) bool {
    if (i == 256) return true;
    
    var candidates = remaining;
    for (dependencies) |d| {
        candidates.unset(d[i]);
    }
    while (random_choice(candidates)) |candidate| {
        var new_remaining = remaining;
        new_remaining.unset(candidate);
        candidates.unset(candidate);
        lut[i] = candidate;
        if (generate_hash_LUT_helper(dependencies, i + 1, new_remaining, lut)) {
            return true;
        }
    } else {
        return false;
    }
}

fn generate_hash_LUT(dependencies: []const Hash_LUT, lut: *Hash_LUT) void {
    if(!generate_hash_LUT_helper(dependencies, 0, ByteBitset.initFull(), lut)) unreachable;
}

fn generate_identity_hash(lut: *Hash_LUT) void {
    for (lut) |*element, i| {
        element.* = @intCast(u8, i);
    }
}

fn generate_luts(comptime hash_count: usize) [hash_count]Hash_LUT {
    var luts: [hash_count]Hash_LUT = undefined;
    
    generate_identity_hash(&luts[0]);
    for (luts[1..]) |*lut, i| {
        generate_hash_LUT(luts[0..i], lut);
    }
    return luts;
}

const TableEntry = packed struct {
    key: u8,
    full: bool,
    exp: u3,
    hash: u4,
    ptr: u48
}

pub fn MiniCuckoo(comptime hash_count: usize) type {
    return struct {
        const Self = @This();
        const luts: [hash_count]Hash_LUT = generate_luts(hash_count);

        table: []TableEntry,
        
        pub fn init() void {
        }
        pub fn put() void {
        }
    };
}

test {
  const CuckooMap = MiniCuckoo(4);
  var map = CuckooMap.init();
}
