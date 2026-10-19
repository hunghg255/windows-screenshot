//! Captured images: the desktop composite, PNG data URLs for the pages,
//! the PNGs pages export, and image files the user inserts.
const std = @import("std");
const geometry = @import("geometry.zig");

/// Opaque BGRA pixels, top-down, as GDI gives them.
pub const Image = struct {
    width: u32,
    height: u32,
    bgra: []u8,

    pub fn alloc(gpa: std.mem.Allocator, width: u32, height: u32) !Image {
        const bytes = try gpa.alloc(u8, @as(usize, width) * height * 4);
        return .{ .width = width, .height = height, .bgra = bytes };
    }

    pub fn deinit(img: *Image, gpa: std.mem.Allocator) void {
        gpa.free(img.bgra);
        img.* = undefined;
    }

    fn row(img: Image, y: usize) []u8 {
        const stride = @as(usize, img.width) * 4;
        return img.bgra[y * stride ..][0..stride];
    }

    /// A copy of the pixels of `r`, which must lie inside the image.
    pub fn crop(img: Image, gpa: std.mem.Allocator, r: geometry.Rect) !Image {
        const out = try alloc(gpa, @intCast(r.width), @intCast(r.height));
        const x: usize = @intCast(r.x);
        for (0..out.height) |y| @memcpy(out.row(y), img.row(@as(usize, @intCast(r.y)) + y)[x * 4 ..][0 .. out.width * 4]);
        return out;
    }
};

/// The frames of `layout`'s displays, in its order, as one image: each
/// frame goes where its display is. Frames are in desktop pixels already.
pub fn composite(gpa: std.mem.Allocator, layout: geometry.Layout, frames: []const Image) !Image {
    if (frames.len != layout.count) return error.MissingFrame;
    var out = try Image.alloc(gpa, @intCast(layout.bounds.width), @intCast(layout.bounds.height));
    @memset(out.bgra, 0);
    for (layout.list(), frames) |d, frame| {
        const r = layout.pixels(d.bounds);
        const w = @min(frame.width, @as(u32, @intCast(r.width)));
        const h = @min(frame.height, @as(u32, @intCast(r.height)));
        const x: usize = @intCast(r.x);
        for (0..h) |y| @memcpy(out.row(@as(usize, @intCast(r.y)) + y)[x * 4 ..][0 .. w * 4], frame.row(y)[0 .. w * 4]);
    }
    return out;
}

/// A PNG of the image: RGB, each row filtered with Sub, deflated fast.
pub fn encodePng(gpa: std.mem.Allocator, img: Image) ![]u8 {
    const flate = std.compress.flate;
    var idat: std.Io.Writer.Allocating = try .initCapacity(gpa, 1 << 16);
    defer idat.deinit();
    const window = try gpa.alloc(u8, flate.max_window_len);
    defer gpa.free(window);
    const z = try gpa.create(flate.Compress);
    defer gpa.destroy(z);
    z.* = try .init(&idat.writer, window, .zlib, .fastest);

    const line = try gpa.alloc(u8, @as(usize, img.width) * 3 + 1);
    defer gpa.free(line);
    line[0] = 1; // Sub: each byte less the one of the pixel on its left
    for (0..img.height) |y| {
        const src = img.row(y);
        var prev: [3]u8 = .{ 0, 0, 0 };
        for (0..img.width) |x| {
            const px: [3]u8 = .{ src[x * 4 + 2], src[x * 4 + 1], src[x * 4] };
            for (0..3) |c| line[1 + x * 3 + c] = px[c] -% prev[c];
            prev = px;
        }
        try z.writer.writeAll(line);
    }
    try z.finish();

    var out: std.Io.Writer.Allocating = try .initCapacity(gpa, idat.written().len + 64);
    errdefer out.deinit();
    try out.writer.writeAll(png_signature);
    var ihdr: [13]u8 = undefined;
    std.mem.writeInt(u32, ihdr[0..4], img.width, .big);
    std.mem.writeInt(u32, ihdr[4..8], img.height, .big);
    ihdr[8..13].* = .{ 8, 2, 0, 0, 0 }; // 8 bits, RGB, deflate, filters, no interlace
    try chunk(&out.writer, "IHDR", &ihdr);
    try chunk(&out.writer, "IDAT", idat.written());
    try chunk(&out.writer, "IEND", "");
    return out.toOwnedSlice();
}

const png_signature = "\x89PNG\r\n\x1a\n";

fn chunk(out: *std.Io.Writer, kind: *const [4]u8, data: []const u8) !void {
    try out.writeInt(u32, @intCast(data.len), .big);
    try out.writeAll(kind);
    try out.writeAll(data);
    var crc = std.hash.Crc32.init();
    crc.update(kind);
    crc.update(data);
    try out.writeInt(u32, crc.final(), .big);
}

const data_url_prefix = "data:image/png;base64,";
const b64 = std.base64.standard;

/// The image as a PNG data URL.
pub fn pngDataUrl(gpa: std.mem.Allocator, img: Image) ![]u8 {
    const png = try encodePng(gpa, img);
    defer gpa.free(png);
    const out = try gpa.alloc(u8, data_url_prefix.len + b64.Encoder.calcSize(png.len));
    @memcpy(out[0..data_url_prefix.len], data_url_prefix);
    _ = b64.Encoder.encode(out[data_url_prefix.len..], png);
    return out;
}

pub const PngError = error{ InvalidPng, PngSizeMismatch, OutOfMemory };

/// The bytes of an exported PNG data URL, checked to be a PNG of the
/// capture's size. The image may be rotated a quarter turn, which swaps
/// its dimensions.
pub fn decodePngDataUrl(gpa: std.mem.Allocator, value: []const u8, width: i32, height: i32) PngError![]u8 {
    if (value.len > 180_000_000 or !std.mem.startsWith(u8, value, data_url_prefix)) return error.InvalidPng;
    const text = value[data_url_prefix.len..];
    const size = b64.Decoder.calcSizeForSlice(text) catch return error.InvalidPng;
    const data = try gpa.alloc(u8, size);
    errdefer gpa.free(data);
    b64.Decoder.decode(data, text) catch return error.InvalidPng;
    if (data.len < 33 or !std.mem.eql(u8, data[0..8], png_signature) or !std.mem.eql(u8, data[12..16], "IHDR"))
        return error.PngSizeMismatch;
    const w = std.mem.readInt(u32, data[16..20], .big);
    const h = std.mem.readInt(u32, data[20..24], .big);
    const cw: u32 = @intCast(width);
    const ch: u32 = @intCast(height);
    if (!(w == cw and h == ch) and !(w == ch and h == cw)) return error.PngSizeMismatch;
    return data;
}

/// An image file the user chose to insert, base64-encoded for the page,
/// which inspects its contents before loading it.
pub const ImportedFile = struct {
    bytes: []const u8,
    extension: []const u8,
};

pub const import_extensions = [_][]const u8{ "png", "jpg", "jpeg", "svg", "webp" };
pub const image_byte_limit = 20 * 1024 * 1024;

pub fn readImported(arena: std.mem.Allocator, io: std.Io, path: []const u8) !ImportedFile {
    const dot = std.fs.path.extension(path);
    const ext = try std.ascii.allocLowerString(arena, if (dot.len > 0) dot[1..] else "");
    for (import_extensions) |e| {
        if (std.mem.eql(u8, e, ext)) break;
    } else return error.InvalidImageType;
    const data = std.Io.Dir.cwd().readFileAlloc(io, path, arena, .limited(image_byte_limit + 1)) catch |err| switch (err) {
        error.StreamTooLong => return error.ImageTooLarge,
        else => return error.ImageUnreadable,
    };
    if (data.len == 0 or data.len > image_byte_limit) return error.ImageTooLarge;
    const encoded = try arena.alloc(u8, b64.Encoder.calcSize(data.len));
    _ = b64.Encoder.encode(encoded, data);
    return .{ .bytes = encoded, .extension = ext };
}

const testing = std.testing;

fn solid(gpa: std.mem.Allocator, w: u32, h: u32, b: u8, g: u8, r: u8) !Image {
    var img = try Image.alloc(gpa, w, h);
    var i: usize = 0;
    while (i < img.bgra.len) : (i += 4) img.bgra[i..][0..4].* = .{ b, g, r, 255 };
    return img;
}

test "frames go where their displays are" {
    const gpa = testing.allocator;
    const layout = try geometry.Layout.init(&.{
        .{ .id = 1, .bounds = .{ .x = 0, .y = 0, .width = 2, .height = 1 } },
        .{ .id = 2, .bounds = .{ .x = -1, .y = 0, .width = 1, .height = 2 } },
    });
    var a = try solid(gpa, 2, 1, 1, 2, 3);
    defer a.deinit(gpa);
    var b = try solid(gpa, 1, 2, 9, 9, 9);
    defer b.deinit(gpa);
    var out = try composite(gpa, layout, &.{ a, b });
    defer out.deinit(gpa);
    try testing.expectEqual(@as(u32, 3), out.width);
    try testing.expectEqual(@as(u32, 2), out.height);
    try testing.expectEqualSlices(u8, &.{ 9, 9, 9, 255, 1, 2, 3, 255, 1, 2, 3, 255 }, out.bgra[0..12]);
    try testing.expectEqualSlices(u8, &.{ 9, 9, 9, 255, 0, 0, 0, 0 }, out.bgra[12..20]);

    var part = try out.crop(gpa, .{ .x = 1, .y = 0, .width = 2, .height = 1 });
    defer part.deinit(gpa);
    try testing.expectEqualSlices(u8, a.bgra, part.bgra);
}

test "an encoded PNG inflates to its filtered rows and passes the export check" {
    const gpa = testing.allocator;
    var img = try solid(gpa, 3, 2, 10, 20, 30);
    defer img.deinit(gpa);
    img.bgra[4..8].* = .{ 0, 0, 255, 255 };
    const png = try encodePng(gpa, img);
    defer gpa.free(png);
    try testing.expectEqualSlices(u8, png_signature, png[0..8]);

    // The IDAT chunk follows the signature and IHDR (8 + 25 bytes).
    const len = std.mem.readInt(u32, png[33..37], .big);
    try testing.expectEqualStrings("IDAT", png[37..41]);
    var in: std.Io.Reader = .fixed(png[41..][0..len]);
    var buf: [std.compress.flate.max_window_len]u8 = undefined;
    var inflate: std.compress.flate.Decompress = .init(&in, .zlib, &buf);
    var rows: [20]u8 = undefined;
    try inflate.reader.readSliceAll(&rows);
    try testing.expectEqualSlices(u8, &.{ 1, 30, 20, 10, 225, 236, 246, 31, 20, 10 }, rows[0..10]);

    const url = try pngDataUrl(gpa, img);
    defer gpa.free(url);
    const back = try decodePngDataUrl(gpa, url, 3, 2);
    defer gpa.free(back);
    try testing.expectEqualSlices(u8, png, back);
    const turned = try decodePngDataUrl(gpa, url, 2, 3);
    gpa.free(turned);
    try testing.expectError(error.PngSizeMismatch, decodePngDataUrl(gpa, url, 3, 3));
    try testing.expectError(error.InvalidPng, decodePngDataUrl(gpa, "data:image/jpeg;base64,AAAA", 3, 2));
    try testing.expectError(error.InvalidPng, decodePngDataUrl(gpa, "data:image/png;base64,!!", 3, 2));
}

test "only images of the allowed types and size are imported" {
    const io = testing.io;
    var arena: std.heap.ArenaAllocator = .init(testing.allocator);
    defer arena.deinit();
    const a = arena.allocator();
    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();
    const dir = try tmp.dir.realPathFileAlloc(io, ".", a);
    try tmp.dir.writeFile(io, .{ .sub_path = "a.PNG", .data = "png" });
    try tmp.dir.writeFile(io, .{ .sub_path = "a.gif", .data = "gif" });
    try tmp.dir.writeFile(io, .{ .sub_path = "empty.jpg", .data = "" });
    const got = try readImported(a, io, try std.fs.path.join(a, &.{ dir, "a.PNG" }));
    try testing.expectEqualStrings("png", got.extension);
    try testing.expectEqualStrings("cG5n", got.bytes);
    try testing.expectError(error.InvalidImageType, readImported(a, io, try std.fs.path.join(a, &.{ dir, "a.gif" })));
    try testing.expectError(error.ImageTooLarge, readImported(a, io, try std.fs.path.join(a, &.{ dir, "empty.jpg" })));
}
