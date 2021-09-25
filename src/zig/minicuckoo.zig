const std = @import("std");
const assert = std.debug.assert;
const expect = std.testing.expect;

const allocator = std.heap.page_allocator;

const ByteBitset = std.StaticBitSet(256);

const Byte_LUT = [256]u8;

fn random_choice(rng: *std.rand.Random, set: ByteBitset) ?u8 {
    if (set.count() == 0) return null;

    var possible_values: [256]u8 = undefined;
    var possible_values_len: usize = 0;

    var iter = set.iterator(.{});
    while (iter.next()) |b| {
        possible_values[possible_values_len] = @intCast(u8, b);
        possible_values_len += 1;
    }

    const rand_index: u8 = @intCast(u8, rng.uintLessThan(usize, possible_values_len));
    return possible_values[rand_index];
}

fn generate_rand_LUT_helper(rng: *std.rand.Random, dependencies: []const Byte_LUT, i: usize, remaining: ByteBitset, lut: *Byte_LUT) bool {
    if (i == 256) return true;

    var candidates = remaining;
    for (dependencies) |d| {
        candidates.unset(d[i]);
    }
    while (random_choice(rng, candidates)) |candidate| {
        var new_remaining = remaining;
        new_remaining.unset(candidate);
        candidates.unset(candidate);
        lut[i] = candidate;
        if (generate_rand_LUT_helper(rng, dependencies, i + 1, new_remaining, lut)) {
            return true;
        }
    } else {
        return false;
    }
}

fn generate_rand_LUT(rng: *std.rand.Random, dependencies: []const Byte_LUT, lut: *Byte_LUT) void {
    if (!generate_rand_LUT_helper(rng, dependencies, 0, ByteBitset.initFull(), lut)) unreachable;
}

fn generate_identity_LUT(lut: *Byte_LUT) void {
    for (lut) |*element, i| {
        element.* = @intCast(u8, i);
    }
}

fn generate_hash_luts(comptime rng: *std.rand.Random, comptime hash_count: usize) [hash_count]Byte_LUT {
    var luts: [hash_count]Byte_LUT = undefined;

    generate_identity_LUT(&luts[0]);
    for (luts[1..]) |*lut, i| {
        generate_rand_LUT(rng, luts[0..i], lut);
    }
    return luts;
}

fn generate_pearson_lut(comptime rng: *std.rand.Random) Byte_LUT {
    var lut: Byte_LUT = undefined;
    const no_deps = [0]Byte_LUT{};

    generate_rand_LUT(rng, no_deps[0..], &lut);

    return lut;
}

const Bucket = packed struct { key: u8 = 0, full: bool = false, exp: u3 = 0, hash: u4 = 0, ptr: u48 = 0 };

pub fn MiniCuckoo(comptime hash_count: usize, comptime T: type) type {
    comptime {
        @setEvalBranchQuota(1000000);
        var rand_state = std.rand.Xoroshiro128.init(0);
        const hash_luts = generate_hash_luts(&rand_state.random, 4);
        const rand_lut = generate_pearson_lut(&rand_state.random);
        
        return packed struct {
            const Self = @This();
            size_step: u3 = 2,
            random: u8 = 0,
            keys: ByteBitset = ByteBitset.initEmpty(),
            buckets: [0]Bucket,

            pub fn init(alloc: *Allocator) *Self {
                return .{ .buckets = [_]Bucket{.{}} ** 256 };
            }
            
            fn bucketSlice(self: *Self) {
                const ptr = @ptrCast([*]Bucket, &self.buckets);
                const end = 1 << size_step;
                return ptr[0..end];
            }
            
            pub fn put(self: *Self, key: u8, value: *T) void {
                
            }
            pub fn get(self: *Self, key: u8) ?*T {
                if (self.keys.isSet(key)) {
                    const mask = ~(~@as(u8, 0) << self.size_step);
                    inline for (hash_luts) |lut, i| {
                        const hash = lut[key];
                        const bucket = self.bucketSlice()[hash & mask];
                        if (bucket.full and bucket.key == key) {
                            return @intToPtr(*T, bucket.ptr);
                        }
                    }
                }
                return null;
            }
        };
    }
}

test "put nothing -> get nothing" {
    const CuckooMap = MiniCuckoo(4, u32);
    var map = CuckooMap.init();
    try expect(map.get(0) == null);
}
