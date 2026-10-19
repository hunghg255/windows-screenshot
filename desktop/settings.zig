//! Settings kept in settings.json in the user data directory, and the
//! global shortcuts that start a capture.
const std = @import("std");

/// The global shortcuts that start a capture.
pub const Shortcuts = struct {
    full: []const u8,
    region: []const u8,
};

/// What settings.json holds. Field names are the file's and the page's.
pub const Settings = struct {
    shortcuts: Shortcuts,
    lastDirectory: ?[]const u8 = null,
};

pub const default_shortcuts: Shortcuts = .{ .full = "Ctrl+Alt+F", .region = "Ctrl+Alt+R" };

const modifiers = [_][]const u8{ "Ctrl", "Alt", "Shift", "Super" };

fn isModifier(p: []const u8) bool {
    for (modifiers) |m| if (std.mem.eql(u8, p, m)) return true;
    return false;
}

fn isKey(p: []const u8) bool {
    if (p.len == 1) return std.ascii.isUpper(p[0]) or std.ascii.isDigit(p[0]);
    if (std.mem.eql(u8, p, "PrintScreen")) return true;
    if (p.len < 2 or p.len > 3 or p[0] != 'F' or p[1] == '0') return false;
    const n = std.fmt.parseInt(u8, p[1..], 10) catch return false;
    return n >= 1 and n <= 24;
}

/// One or more different modifiers, then a letter, digit, F1–F24 or
/// PrintScreen: "Ctrl+Alt+F".
pub fn validShortcut(v: []const u8) bool {
    var parts: [8][]const u8 = undefined;
    var n: usize = 0;
    var it = std.mem.splitScalar(u8, v, '+');
    while (it.next()) |p| {
        if (n == parts.len) return false;
        parts[n] = p;
        n += 1;
    }
    if (n < 2 or !isKey(parts[n - 1])) return false;
    for (parts[0 .. n - 1], 0..) |p, i| {
        if (!isModifier(p)) return false;
        for (parts[0..i]) |q| if (std.mem.eql(u8, p, q)) return false;
    }
    return true;
}

/// Whether two valid shortcuts are the same keys, in any order.
fn sameKeys(a: []const u8, b: []const u8) bool {
    if (std.mem.count(u8, a, "+") != std.mem.count(u8, b, "+")) return false;
    var it = std.mem.splitScalar(u8, a, '+');
    outer: while (it.next()) |p| {
        var other = std.mem.splitScalar(u8, b, '+');
        while (other.next()) |q| if (std.mem.eql(u8, p, q)) continue :outer;
        return false;
    }
    return true;
}

pub fn validateShortcuts(s: Shortcuts) bool {
    return validShortcut(s.full) and validShortcut(s.region) and !sameKeys(s.full, s.region);
}

/// Settings whose strings are owned by `gpa`.
pub const Owned = struct {
    value: Settings,

    pub fn init(gpa: std.mem.Allocator, s: Settings) !Owned {
        const full = try gpa.dupe(u8, s.shortcuts.full);
        errdefer gpa.free(full);
        const region = try gpa.dupe(u8, s.shortcuts.region);
        errdefer gpa.free(region);
        const last = if (s.lastDirectory) |d| try gpa.dupe(u8, d) else null;
        return .{ .value = .{ .shortcuts = .{ .full = full, .region = region }, .lastDirectory = last } };
    }

    pub fn deinit(o: *Owned, gpa: std.mem.Allocator) void {
        gpa.free(o.value.shortcuts.full);
        gpa.free(o.value.shortcuts.region);
        if (o.value.lastDirectory) |d| gpa.free(d);
        o.* = undefined;
    }

    /// Replaces the settings with a copy of `s`.
    pub fn set(o: *Owned, gpa: std.mem.Allocator, s: Settings) !void {
        const next = try init(gpa, s);
        o.deinit(gpa);
        o.* = next;
    }
};

pub const Loaded = struct {
    settings: Owned,
    warning: []const u8 = "",
};

/// The saved settings, or the defaults with a warning when the file can't
/// be read.
pub fn load(gpa: std.mem.Allocator, io: std.Io, path: []const u8) !Loaded {
    const fallback: Settings = .{ .shortcuts = default_shortcuts };
    const data = std.Io.Dir.cwd().readFileAlloc(io, path, gpa, .limited(1 << 20)) catch |err| switch (err) {
        error.FileNotFound => return .{ .settings = try .init(gpa, fallback) },
        else => return .{ .settings = try .init(gpa, fallback), .warning = unreadable },
    };
    defer gpa.free(data);
    const parsed = std.json.parseFromSlice(Settings, gpa, data, .{ .ignore_unknown_fields = true }) catch
        return .{ .settings = try .init(gpa, fallback), .warning = unreadable };
    defer parsed.deinit();
    if (!validateShortcuts(parsed.value.shortcuts)) return .{ .settings = try .init(gpa, fallback), .warning = unreadable };
    return .{ .settings = try .init(gpa, parsed.value) };
}

const unreadable = "Configuration was unreadable. Default shortcuts restored.";

/// Writes the settings to a new file, then puts it in place.
pub fn persist(gpa: std.mem.Allocator, io: std.Io, path: []const u8, s: Settings) !void {
    const text = try std.json.Stringify.valueAlloc(gpa, s, .{ .whitespace = .indent_2, .emit_null_optional_fields = false });
    defer gpa.free(text);
    const tmp = try std.fmt.allocPrint(gpa, "{s}.new", .{path});
    defer gpa.free(tmp);
    const cwd = std.Io.Dir.cwd();
    if (std.fs.path.dirname(path)) |dir| try cwd.createDirPath(io, dir);
    try cwd.writeFile(io, .{ .sub_path = tmp, .data = text });
    try cwd.rename(tmp, cwd, path, io);
}

pub const Action = enum { full, region };

pub const ReplaceError = error{ InvalidShortcuts, ShortcutInUse, ShortcutRestoreFailed };

/// Swaps `old` for `next`, restoring `old` when `next` cannot be registered
/// completely. `registry` has `register(Action, []const u8) !void` and
/// `unregister(Action) void`.
pub fn replaceShortcuts(registry: anytype, old: ?Shortcuts, next: Shortcuts) ReplaceError!void {
    if (!validateShortcuts(next)) return error.InvalidShortcuts;
    if (old != null) {
        registry.unregister(.full);
        registry.unregister(.region);
    }
    registry.register(.full, next.full) catch return restore(registry, old, false);
    registry.register(.region, next.region) catch return restore(registry, old, true);
}

fn restore(registry: anytype, old: ?Shortcuts, full_added: bool) ReplaceError {
    if (full_added) registry.unregister(.full);
    const o = old orelse return error.ShortcutInUse;
    var lost = false;
    registry.register(.full, o.full) catch {
        lost = true;
    };
    registry.register(.region, o.region) catch {
        lost = true;
    };
    return if (lost) error.ShortcutRestoreFailed else error.ShortcutInUse;
}

const testing = std.testing;

test "shortcuts need different modifiers and one key" {
    for ([_][]const u8{ "Ctrl+Alt+F", "Super+PrintScreen", "Shift+F24", "Ctrl+1", "Alt+Shift+Ctrl+Super+Z" }) |s|
        try testing.expect(validShortcut(s));
    for ([_][]const u8{ "F", "Ctrl", "Ctrl+Ctrl+F", "Ctrl+f", "Ctrl+F25", "Ctrl+F0", "Ctrl+F+G", "Meta+F", "Ctrl+", "" }) |s|
        try testing.expect(!validShortcut(s));
}

test "two shortcuts must differ in their keys, not their order" {
    try testing.expect(validateShortcuts(default_shortcuts));
    try testing.expect(!validateShortcuts(.{ .full = "Ctrl+Alt+F", .region = "Alt+Ctrl+F" }));
    try testing.expect(validateShortcuts(.{ .full = "Ctrl+Alt+F", .region = "Ctrl+F" }));
}

const FakeRegistry = struct {
    taken: []const []const u8 = &.{},
    held: [2]?[]const u8 = .{ null, null },

    fn register(r: *FakeRegistry, a: Action, key: []const u8) !void {
        for (r.taken) |t| if (std.mem.eql(u8, t, key)) return error.Unavailable;
        if (r.held[@backingInt(a)] != null) return error.Unavailable;
        r.held[@backingInt(a)] = key;
    }

    fn unregister(r: *FakeRegistry, a: Action) void {
        r.held[@backingInt(a)] = null;
    }
};

test "replacing shortcuts registers the new ones" {
    var r: FakeRegistry = .{};
    try replaceShortcuts(&r, null, default_shortcuts);
    try replaceShortcuts(&r, default_shortcuts, .{ .full = "Ctrl+1", .region = "Ctrl+2" });
    try testing.expectEqualStrings("Ctrl+1", r.held[0].?);
    try testing.expectEqualStrings("Ctrl+2", r.held[1].?);
}

test "a shortcut in use restores the old ones" {
    var r: FakeRegistry = .{ .taken = &.{"Ctrl+2"} };
    try replaceShortcuts(&r, null, default_shortcuts);
    try testing.expectError(error.ShortcutInUse, replaceShortcuts(&r, default_shortcuts, .{ .full = "Ctrl+1", .region = "Ctrl+2" }));
    try testing.expectEqualStrings("Ctrl+Alt+F", r.held[0].?);
    try testing.expectEqualStrings("Ctrl+Alt+R", r.held[1].?);
    try testing.expectError(error.InvalidShortcuts, replaceShortcuts(&r, default_shortcuts, .{ .full = "F", .region = "Ctrl+2" }));
}

test "settings survive a round trip, and bad files fall back to the defaults" {
    const gpa = testing.allocator;
    const io = testing.io;
    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();
    const dir = try tmp.dir.realPathFileAlloc(io, ".", gpa);
    defer gpa.free(dir);
    const path = try std.fs.path.join(gpa, &.{ dir, "settings.json" });
    defer gpa.free(path);

    var missing = try load(gpa, io, path);
    defer missing.settings.deinit(gpa);
    try testing.expectEqualStrings("", missing.warning);
    try testing.expectEqualStrings("Ctrl+Alt+F", missing.settings.value.shortcuts.full);

    try persist(gpa, io, path, .{ .shortcuts = .{ .full = "Ctrl+1", .region = "Ctrl+2" }, .lastDirectory = "C:\\Pictures" });
    var saved = try load(gpa, io, path);
    defer saved.settings.deinit(gpa);
    try testing.expectEqualStrings("Ctrl+1", saved.settings.value.shortcuts.full);
    try testing.expectEqualStrings("C:\\Pictures", saved.settings.value.lastDirectory.?);

    try tmp.dir.writeFile(io, .{ .sub_path = "settings.json", .data = "{\"shortcuts\":{\"full\":\"F\",\"region\":\"G\"}}" });
    var bad = try load(gpa, io, path);
    defer bad.settings.deinit(gpa);
    try testing.expect(bad.warning.len > 0);
    try testing.expectEqualStrings("Ctrl+Alt+R", bad.settings.value.shortcuts.region);
}
