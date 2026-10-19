//! The virtual desktop in physical pixels. The process is per-monitor DPI
//! aware, so monitor rectangles, the cursor and the composite image share
//! one coordinate space and no display is resampled.
const std = @import("std");

/// A position in desktop or image pixels.
pub const Point = struct {
    x: i32,
    y: i32,
};

/// A position and size in desktop or image pixels.
pub const Rect = struct {
    x: i32,
    y: i32,
    width: i32,
    height: i32,

    pub fn right(r: Rect) i32 {
        return r.x + r.width;
    }

    pub fn bottom(r: Rect) i32 {
        return r.y + r.height;
    }

    pub fn contains(r: Rect, p: Point) bool {
        return p.x >= r.x and p.x < r.right() and p.y >= r.y and p.y < r.bottom();
    }
};

/// One display of the virtual desktop; `id` is its HMONITOR.
pub const Display = struct {
    id: usize,
    bounds: Rect,
};

/// Bound both the native composite and the editor's cached canvas surfaces.
pub const max_pixels = 32_000_000;
pub const max_edge = 16_384;

pub const LayoutError = error{ NoDisplays, InvalidDisplayGeometry, DesktopTooLarge };

/// The virtual desktop mapped onto one image.
pub const Layout = struct {
    bounds: Rect,
    /// At most `max_displays`; the rest are refused.
    displays: [max_displays]Display = undefined,
    count: usize = 0,

    pub const max_displays = 16;

    pub fn init(displays: []const Display) LayoutError!Layout {
        if (displays.len == 0) return error.NoDisplays;
        if (displays.len > max_displays) return error.InvalidDisplayGeometry;
        var min_x: i64 = std.math.maxInt(i64);
        var min_y: i64 = std.math.maxInt(i64);
        var max_x: i64 = std.math.minInt(i64);
        var max_y: i64 = std.math.minInt(i64);
        var total: i64 = 0;
        for (displays) |d| {
            const b = d.bounds;
            if (b.width <= 0 or b.height <= 0) return error.InvalidDisplayGeometry;
            min_x = @min(min_x, b.x);
            min_y = @min(min_y, b.y);
            max_x = @max(max_x, @as(i64, b.x) + b.width);
            max_y = @max(max_y, @as(i64, b.y) + b.height);
            total += @as(i64, b.width) * b.height;
        }
        const width = max_x - min_x;
        const height = max_y - min_y;
        if (total > max_pixels or width > max_edge or height > max_edge or width * height > max_pixels)
            return error.DesktopTooLarge;
        var l: Layout = .{ .bounds = .{ .x = @intCast(min_x), .y = @intCast(min_y), .width = @intCast(width), .height = @intCast(height) } };
        @memcpy(l.displays[0..displays.len], displays);
        l.count = displays.len;
        return l;
    }

    pub fn list(l: *const Layout) []const Display {
        return l.displays[0..l.count];
    }

    /// A desktop rectangle in composite image pixels.
    pub fn pixels(l: Layout, r: Rect) Rect {
        return .{ .x = r.x - l.bounds.x, .y = r.y - l.bounds.y, .width = r.width, .height = r.height };
    }

    /// The rectangle between two desktop points, clamped to the desktop.
    pub fn region(l: Layout, start: Point, end: Point) Rect {
        const b = l.bounds;
        const x = std.math.clamp(@min(start.x, end.x), b.x, b.right());
        const y = std.math.clamp(@min(start.y, end.y), b.y, b.bottom());
        return .{
            .x = x,
            .y = y,
            .width = std.math.clamp(@max(start.x, end.x), b.x, b.right()) - x,
            .height = std.math.clamp(@max(start.y, end.y), b.y, b.bottom()) - y,
        };
    }

    /// Whether `other` has the same displays, in the same places.
    pub fn same(l: *const Layout, other: *const Layout) bool {
        if (l.count != other.count) return false;
        for (l.list(), other.list()) |a, b| {
            if (a.id != b.id or !std.meta.eql(a.bounds, b.bounds)) return false;
        }
        return true;
    }
};

pub fn intersects(a: Rect, b: Rect) bool {
    return @min(a.right(), b.right()) > @max(a.x, b.x) and @min(a.bottom(), b.bottom()) > @max(a.y, b.y);
}

pub fn validRect(r: Rect, width: i32, height: i32) bool {
    return r.x >= 0 and r.y >= 0 and r.width > 0 and r.height > 0 and
        @as(i64, r.x) + r.width <= width and @as(i64, r.y) + r.height <= height;
}

const testing = std.testing;

fn display(id: usize, x: i32, y: i32, w: i32, h: i32) Display {
    return .{ .id = id, .bounds = .{ .x = x, .y = y, .width = w, .height = h } };
}

test "a layout spans displays left of and above the primary one" {
    const l = try Layout.init(&.{ display(1, 0, 0, 1920, 1080), display(2, -1280, -200, 1280, 1024) });
    try testing.expectEqual(Rect{ .x = -1280, .y = -200, .width = 3200, .height = 1280 }, l.bounds);
    try testing.expectEqual(Rect{ .x = 1280, .y = 200, .width = 1920, .height = 1080 }, l.pixels(l.displays[0].bounds));
    try testing.expectEqual(Rect{ .x = 0, .y = 0, .width = 1280, .height = 1024 }, l.pixels(l.displays[1].bounds));
}

test "layouts refuse no displays, empty ones and huge desktops" {
    try testing.expectError(error.NoDisplays, Layout.init(&.{}));
    try testing.expectError(error.InvalidDisplayGeometry, Layout.init(&.{display(1, 0, 0, 0, 1080)}));
    try testing.expectError(error.DesktopTooLarge, Layout.init(&.{display(1, 0, 0, 16_385, 100)}));
    try testing.expectError(error.DesktopTooLarge, Layout.init(&.{ display(1, 0, 0, 7680, 4320), display(2, 7680, 0, 7680, 4320) }));
}

test "a region is clamped to the desktop and ordered" {
    const l = try Layout.init(&.{display(1, 0, 0, 100, 50)});
    try testing.expectEqual(Rect{ .x = 10, .y = 0, .width = 90, .height = 20 }, l.region(.{ .x = 200, .y = 20 }, .{ .x = 10, .y = -30 }));
    try testing.expectEqual(Rect{ .x = 5, .y = 5, .width = 0, .height = 0 }, l.region(.{ .x = 5, .y = 5 }, .{ .x = 5, .y = 5 }));
}

test "rectangles intersect and fit images" {
    const a: Rect = .{ .x = 0, .y = 0, .width = 10, .height = 10 };
    try testing.expect(intersects(a, .{ .x = 9, .y = 9, .width = 5, .height = 5 }));
    try testing.expect(!intersects(a, .{ .x = 10, .y = 0, .width = 5, .height = 5 }));
    try testing.expect(validRect(a, 10, 10));
    try testing.expect(!validRect(a, 9, 10));
    try testing.expect(!validRect(.{ .x = -1, .y = 0, .width = 1, .height = 1 }, 10, 10));
    try testing.expect(!validRect(.{ .x = 0, .y = 0, .width = 0, .height = 1 }, 10, 10));
}
