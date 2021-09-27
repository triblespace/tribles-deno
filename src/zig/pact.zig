const std = @import("std");
const assert = std.debug.assert;
const expect = std.testing.expect;

const ByteBitset = std.StaticBitSet(256);

const Byte_LUT = [256]u8;

const hash_count = 4;

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

fn generate_rand_LUT_helper(rng: *std.rand.Random, dependencies: []const Byte_LUT, i: usize, remaining: ByteBitset, mask: u8, lut: *Byte_LUT) bool {
    if (i == 256) return true;

    var candidates = remaining;
    var iter = remaining.iterator(.{});
    while (iter.next()) |candidate| {
        for (dependencies) |d| {
            if ((d[i] & mask) == (candidate & mask)) {
                candidates.unset(candidate);
            }
        }
    }
    while (random_choice(rng, candidates)) |candidate| {
        var new_remaining = remaining;
        new_remaining.unset(candidate);
        candidates.unset(candidate);
        lut[i] = candidate;
        if (generate_rand_LUT_helper(rng, dependencies, i + 1, new_remaining, mask, lut)) {
            return true;
        }
    } else {
        return false;
    }
}

fn generate_rand_LUT(rng: *std.rand.Random, dependencies: []const Byte_LUT, mask: u8, lut: *Byte_LUT) void {
    if (!generate_rand_LUT_helper(rng, dependencies, 0, ByteBitset.initFull(), mask, lut)) unreachable;
}

fn generate_identity_LUT(lut: *Byte_LUT) void {
    for (lut) |*element, i| {
        element.* = @intCast(u8, i);
    }
}

fn generate_hash_luts(comptime rng: *std.rand.Random) [hash_count]Byte_LUT {
    var luts: [hash_count]Byte_LUT = undefined;

    generate_identity_LUT(&luts[0]);
    for (luts[1..]) |*lut, i| {
        generate_rand_LUT(rng, luts[0..i], hash_count - 1, lut);
    }
    return luts;
}

fn generate_pearson_lut(comptime rng: *std.rand.Random) Byte_LUT {
    var lut: Byte_LUT = undefined;
    const no_deps = [0]Byte_LUT{};

    generate_rand_LUT(rng, no_deps[0..], 0b11111111, &lut);

    return lut;
}

///    ╔════════════════════════╗
///    ║     PACT Node Head     ║
///    ╚════════════════════════╝
///
///
///        4 byte
///  1 byte   │
///     │     └─────┐
///     └────────┐  │
///              │┌──┐
///              ╻┌──┐
///              ┃│  │
///              ╹└──┘
///              │  │
///       ┌──────┘ ┌┘
///       │        │
///       │    refcount
/// branch depth
///
const PACTHeader = packed struct { depth: u8, refcount: u32 };

///   ╔════════════════════════╗
///   ║       PACT Inner       ║
///   ╚════════════════════════╝
///
///                      5 byte
///        4 byte  1 byte   │ 5 byte
///  1 byte   │       │  ┌──┘    │    16 byte                 32 byte                                         64 byte
///     │     └─────┐ │  │    ┌──┘       │                       │                                               │
///     └────────┐  │ │  │    │          │                       │                                               │
///              │┌──┐│┌───┐┌───┐┌──────────────┐┌──────────────────────────────┐┌──────────────────────────────────────────────────────────────┐
///              ╻┌──┐╻┌───┐┌───┐┌──────────────┐┌──────────────────────────────┐┌──────────────────────────────────────────────────────────────┐┌─────────────
///              ┃│  │┃│   ││   ││     hash     ││         child bitmap         ││                             key                              ││ buckets...
///              ╹└──┘╹└───┘└───┘└──────────────┘└──────────────────────────────┘└──────────────────────────────────────────────────────────────┘└─────────────
///              │  │ │  │    │
///       ┌──────┘ ┌┘ │  └──┐ └────────┐
///       │        │  └─┐   │          │
///       │    refcount │ count  segment count
/// branch depth        │
///               bucket count
///
const Bucket = packed struct { key: u8 = 0, ptr: u40 = 0 };

const PACTInner = comptime blk: {
    @setEvalBranchQuota(1000000);
    var rand_state = std.rand.Xoroshiro128.init(0);
    const hash_luts = generate_hash_luts(&rand_state.random); // TODO: Can we move this into the struct scope?
    const rand_lut = generate_pearson_lut(&rand_state.random);

    break :blk struct {
        const Self = @This();
        var random: u8 = 0;
        /// Note that the initial []buckets size needs to be >= |hash_LUTS|.
        /// This is to ensure that resized can't result in other hash functions pointing to now
        /// invalid buckets with false positively matching keys.
        bucket_mask: u8 = hash_count - 1,
        keys: ByteBitset = ByteBitset.initEmpty(),

        pub fn init(allocator: *std.mem.Allocator) Self {
            return Self{};
        }

        fn bucketSlice(self: *Self) []Bucket {
            const ptr = @intToPtr([*]Bucket, @ptrToInt(self) + @sizeOf(Self));
            const end = self.bucket_mask + 1;
            return ptr[0..end];
        }

        pub fn put(self: *Self, key: u8) void {}
        pub fn get(self: *Self, key: u8) ?*PACTHeader {
            if (self.keys.isSet(key)) {
                inline for (hash_luts) |lut, i| {
                    const hash = lut[key];
                    const bucket = self.bucketSlice()[hash & self.bucket_mask];
                    if (bucket.key == key and bucket.ptr != 0) {
                        return @intToPtr(*PACTHeader, bucket.ptr);
                    }
                }
            }
            return null;
        }
    };
};

const PACTNode = union(enum) { inner: *PACTInner, leaf: *PACTLeaf };

const PACTHeader = packed struct {
    const Self = @This();

    branch_depth: u8,
    refcount: u32,

    pub fn toNode(self: *Self) PACTNode {
        if (self.branch_depth == 255) {
            return .{ .leaf = @fieldParentPtr(PACTLeaf, "header", self) };
        } else {
            return .{ .inner = @fieldParentPtr(PACTInner, "header", self) };
        }
    }
};

test "put nothing -> get nothing" {
    var inner = PACTInner.init(std.heap.page_allocator);
    var node = PACTNode{ .inner = node };
    try expect(node.get(0) == null);
}
