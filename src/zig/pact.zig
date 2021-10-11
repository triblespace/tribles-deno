const std = @import("std");
const assert = std.debug.assert;
const expect = std.testing.expect;

const allocator = std.heap.page_allocator;

const ByteBitset = std.StaticBitSet(256);

const HASH_COUNT = 4;
const KEY_LENGTH = 64;

const MAX_ATTEMPTS = 8;

const Byte_LUT = [256]u8;
const Hash_LUT = [256][HASH_COUNT]u8;

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

fn generate_hash_luts(comptime rng: *std.rand.Random) Hash_LUT {
    var luts: [HASH_COUNT]Byte_LUT = undefined;

    generate_identity_LUT(&luts[0]);
    for (luts[1..]) |*lut, i| {
        generate_rand_LUT(rng, luts[0..i], HASH_COUNT - 1, lut);
    }

    var hash_lut: Hash_LUT = undefined;

    for(luts) |lut, i| {
        for(lut) |h, j| {
            hash_lut[j][i] = h;
        }
    }

    return hash_lut;
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
const PACTNode = union(enum) { inner: *PACTInner, leaf: *PACTLeaf };

const PACTHeader = struct {
    const Self = @This();

    branch_depth: u8,
    refcount: u32,

    pub fn toNode(self: *Self) PACTNode {
        if (self.branch_depth == KEY_LENGTH) {
            return .{ .leaf = @fieldParentPtr(PACTLeaf, "header", self) };
        } else {
            return .{ .inner = @fieldParentPtr(PACTInner, "header", self) };
        }
    }
};
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
    const hash_lut = generate_hash_lut(&rand_state.random);
    const rand_lut = generate_pearson_lut(&rand_state.random);

    break :blk struct {
        const Self = @This();
        var random: u8 = 0;
        /// Note that the initial []buckets size needs to be >= |hash_LUTS|.
        /// This is to ensure that resized can't result in other hash functions pointing to now
        /// invalid buckets with false positively matching keys.
        header: PACTHeader,
        key: u8[KEY_LENGTH],
        bucket_mask: u8 = HASH_COUNT - 1,
        child_set: ByteBitset = ByteBitset.initEmpty(),

        pub fn init(branch_depth: u8, key: *u8[KEY_LENGTH]) *Self {
        const raw = allocator.alloc(u8, @sizeOf(Self) + @sizeOf(Bucket) * HASH_COUNT) catch unreachable;
        const new = @ptrCast(Self, raw);
        new.* = Self{.header = PACTHeader{.branch_depth=branch_depth,
                                          .refcount = 1}),
                    .key = key.*};
        for(new.bucketSlice()) |*bucket| {
            bucket.* = Bucket{};
        }
        return new;
        }

        fn putBranch(self: *Self, key: u8, value: *PACTHeader) {
            const buckets = self.bucketSlice();
            var ptr = @intCast(u40, @ptrCast(value));
            
            var attempts: u8 = 0;
            while(true) {
            random = rand_lut[random ^ key];
            const bucket_hashes = hash_lut[key];
            inline for (bucket_hashes) |*hash| {
                hash &= self.bucket_mask;
            }
            inline for (bucket_hashes) |bucket| {
                if(buckets[bucket].key == key or buckets[bucket].ptr == 0) {
                    buckets[bucket].key = key;
                    buckets[bucket].ptr = ptr;
                    return;
                }
                const free = true;
                inline for (hash_lut[bucket.key]) |hash| {
                    if(bucket == hash & self.bucket_mask) {
                        free = false;
                        break;
                    }
                }
                if(free) {
                    buckets[bucket].key = key;
                    buckets[bucket].ptr = ptr;
                    return;
                }
            }
            const displaced = if(self.bucket_mask == 0xFF) 0 else bucket_hashes[random & HASH_COUNT-1];
            const displaced_key = buckets[displaced].key;
            const displaced_ptr = buckets[displaced].ptr;
            buckets[displaced].key = key;
            buckets[displaced].ptr = ptr;
            key = displaced_key;
            ptr = displaced_ptr;

            if(self.bucket_mask != 0xFF) attempts += 1;
            if(attempts == MAX_ATTEMPTS) {
                attempts = 0;
                self.grow();
            }
            }
        }

        fn bucketSlice(self: *Self) []Bucket {
            const ptr = @intToPtr([*]Bucket, @ptrToInt(self) + @sizeOf(Self));
            const end = self.bucket_mask + 1;
            return ptr[0..end];
        }

        pub fn put(self: *Self, key: u8) void {}
        pub fn get(self: *Self, key: u8) ?*PACTHeader {
            if (self.child_set.isSet(key)) {
                const hashes = hash_lut[key];
                inline for (hashes) |hash| {
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

///      ╔════════════════════════╗
///      ║       PACT Leaf        ║
///      ╚════════════════════════╝
///
///
/// 1 byte   4 byte
/// always 64   │                                    64 byte
///     │       └─────┐                                 │
///     └──────────┐  │                                 │
///                │┌──┐┌──────────────────────────────────────────────────────────────┐
///                ╻┌──┐┌──────────────────────────────────────────────────────────────┐┌─────────────
///                ┃│  ││                             key                              ││  value...
///                ╹└──┘└──────────────────────────────────────────────────────────────┘└─────────────
///                │  │
///         ┌──────┘ ┌┘
///         │        │
///         │    refcount
///   branch depth
const PACTLeaf = struct {
    header: PACTHeader,
    key: u8[KEY_LENGTH],
    value: usize = 0,

    pub fn init(key: *u8[KEY_LENGTH], value: usize) *Self {
        const new = allocator.create(Self) catch unreachable;
        new.* = Self{.header = PACTHeader{.branch_depth=KEY_LENGTH,
                                          .refcount = 1}),
                    .key = key.*,
                    .value = value};
                    return new;
    }

    pub fn peek(self: *Self, depth: u8) ?u8 {
        if (depth < KEY_LENGTH) return self.key[depth];
        return null;
    }

    pub fn propose(self: *Self, depth: u8, result_set: *ByteBitset) void {
        var set = ByteBitset.initEmpty();
        set.set(self.key[depth]);
        result_set.setIntersection(set);
    }

        pub fn get(self: *Self, depth: u8, key: u8) ?*PACTHeader {
        if (depth < KEY_LENGTH and this.key[depth] == v) return &self.header;
        return null;
    }

    pub fn put(self: *Self, depth: u8, key: *u8[KEY_LENGTH], value: usize) *PACTHeader {
        while (depth < KEY_LENGTH and this.key[depth] != key[depth]) depth += 1;

      if (depth == KEY_LENGTH) {
        return &self.header;
      }

      const sibling = PACTLeaf.init(key, value);

      const branchChildren = [];
      const leftIndex = this.key[depth];
      const rightIndex = key[depth];
      branchChildren[leftIndex] = this;
      branchChildren[rightIndex] = sibling;
      const branchChildbits = emptySet();
      setBit(branchChildbits, leftIndex);
      setBit(branchChildbits, rightIndex);
      const hash = hash_combine(this.hash, sibling.hash);

      return new PACTNode(
        this.key,
        depth,
        branchChildbits,
        branchChildren,
        hash,
        2,
        owner
      );
    }

};

test "put nothing -> get nothing" {
    var inner = PACTInner.init(std.heap.page_allocator);
    var node = PACTNode{ .inner = node };
    try expect(node.get(0) == null);
}
