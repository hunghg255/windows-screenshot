//! Screenshot: what the app's pages call. Every method checks the calling
//! window's role. Errors reach the page as their names, which
//! src/bridge.ts turns into messages.
const std = @import("std");
const myzig = @import("myzig");
const main = @import("main.zig");
const geometry = @import("geometry.zig");
const image = @import("image.zig");
const settings_mod = @import("settings.zig");
const win32 = @import("win32.zig");

const State = main.State;
const Rect = geometry.Rect;

pub const CaptureRequest = struct { mode: main.CaptureMode };

/// What the settings window shows.
pub const SettingsState = struct {
    settings: settings_mod.Settings,
    warning: []const u8,
};

pub const SelectionPhase = enum { start, end, reset };
pub const OutputAction = enum { copy, save };
pub const OutputResult = enum { copied, saved, cancelled };

const Role = enum { settings, capture, any };

pub const Screenshot = struct {
    state: *State = undefined,

    pub const myzig_params = .{
        .updateShortcuts = .{"next"},
        .capture = .{"request"},
        .selection = .{ "id", "phase" },
        .importImage = .{"id"},
        .cancel = .{"id"},
        .crop = .{ "id", "r" },
        .output = .{ "id", "action", "png" },
    };

    fn authorize(self: *Screenshot, call: *myzig.Call, role: Role) error{Unauthorized}!*State {
        const s = self.state;
        const w = call.window;
        const in_capture = s.isCaptureWindow(w);
        const is_settings = s.settings_window == w;
        const ok = switch (role) {
            .settings => is_settings,
            .capture => in_capture,
            .any => is_settings or in_capture,
        };
        return if (ok) s else error.Unauthorized;
    }

    /// The settings, and why they may not be the saved ones.
    pub fn settings(self: *Screenshot, call: *myzig.Call) !SettingsState {
        const s = try self.authorize(call, .settings);
        return .{ .settings = s.settings.value, .warning = try call.arena.dupe(u8, s.warning.items) };
    }

    /// Registers new shortcuts and saves them.
    pub fn updateShortcuts(self: *Screenshot, call: *myzig.Call, next: settings_mod.Shortcuts) !settings_mod.Settings {
        const s = try self.authorize(call, .settings);
        if (s.output_busy) return error.Busy;
        const old = if (s.registered) s.settings.value.shortcuts else null;
        try settings_mod.replaceShortcuts(&s.host, old, next);
        var updated = s.settings.value;
        updated.shortcuts = next;
        settings_mod.persist(s.gpa, s.io, s.config_path, updated) catch {
            settings_mod.replaceShortcuts(&s.host, next, old orelse s.settings.value.shortcuts) catch {};
            return error.SettingsNotSaved;
        };
        try s.settings.set(s.gpa, updated);
        s.registered = true;
        s.setWarning("");
        return s.settings.value;
    }

    /// Starts a capture of every display.
    pub fn capture(self: *Screenshot, call: *myzig.Call, request: CaptureRequest) !void {
        const s = try self.authorize(call, .settings);
        try s.beginCapture(request.mode);
    }

    /// The capture the calling window shows.
    pub fn current(self: *Screenshot, call: *myzig.Call) !?main.CaptureData {
        const s = try self.authorize(call, .capture);
        if (s.overlayOf(call.window)) |o| {
            var d = s.data orelse return null;
            d.image = o.image;
            d.overlayBounds = o.bounds;
            return d;
        }
        return s.data;
    }

    /// Starts, resets or ends the selection of a region; the cursor is read
    /// here, so it spans displays.
    pub fn selection(self: *Screenshot, call: *myzig.Call, id: []const u8, phase: SelectionPhase) !void {
        const s = try self.authorize(call, .capture);
        try s.assertSession(id);
        if (s.overlayOf(call.window) == null or s.layout == null or s.data.?.mode != .region) return error.SelectionUnavailable;
        switch (phase) {
            .start => try s.startSelection(call.window),
            .reset, .end => {
                const r = try s.endSelection(call.window);
                if (phase == .end and r.width > 0 and r.height > 0) try s.finishCrop(id, r);
            },
        }
    }

    /// Asks for an image file to insert into the capture.
    pub fn importImage(self: *Screenshot, call: *myzig.Call, id: []const u8) !?image.ImportedFile {
        const s = try self.authorize(call, .capture);
        try s.assertSession(id);
        if (s.import_busy or s.output_busy or s.data.?.mode != .full) return error.Busy;
        s.import_busy = true;
        defer s.import_busy = false;
        const paths = (try myzig.dialog.open(s.gpa, .{ .title = "Insert image", .extensions = &image.import_extensions })) orelse return null;
        defer myzig.dialog.freePaths(s.gpa, paths);
        if (paths.len == 0) return null;
        const imported = try image.readImported(call.arena, s.io, paths[0]);
        try s.assertSession(id);
        return imported;
    }

    /// Ends the capture.
    pub fn cancel(self: *Screenshot, call: *myzig.Call, id: []const u8) !void {
        const s = try self.authorize(call, .capture);
        try s.assertSession(id);
        if (s.output_busy) return error.ExportBusy;
        s.clearCapture();
    }

    /// Selects a region of the desktop in composite pixels.
    pub fn crop(self: *Screenshot, call: *myzig.Call, id: []const u8, r: Rect) !void {
        const s = try self.authorize(call, .capture);
        try s.finishCrop(id, r);
    }

    /// Copies the annotated PNG to the clipboard or saves it.
    pub fn output(self: *Screenshot, call: *myzig.Call, id: []const u8, action: OutputAction, png: []const u8) !OutputResult {
        const s = try self.authorize(call, .capture);
        try s.assertSession(id);
        const data = s.data.?;
        if (s.output_busy or s.import_busy or data.mode != .full) return error.ExportUnavailable;
        s.output_busy = true;
        defer s.output_busy = false;
        const bytes = try image.decodePngDataUrl(call.arena, png, data.width, data.height);
        if (action == .copy) {
            myzig.clipboard.writeImage(s.gpa, bytes) catch return error.ClipboardUnavailable;
            return .copied;
        }
        const directory = if (s.settings.value.lastDirectory) |d| d else win32.picturesDir(call.arena) orelse "";
        const name = try fileName(call.arena, s.io);
        const start = if (directory.len > 0) try std.fs.path.join(call.arena, &.{ directory, name }) else name;
        const path = (try myzig.dialog.save(s.gpa, .{ .title = "Save screenshot", .name = start, .extensions = &.{"png"}, .create_directories = true })) orelse return .cancelled;
        defer s.gpa.free(path);
        try s.assertSession(id);
        const target = if (std.ascii.endsWithIgnoreCase(path, ".png")) path else try std.fmt.allocPrint(call.arena, "{s}.png", .{path});
        std.Io.Dir.cwd().writeFile(s.io, .{ .sub_path = target, .data = bytes }) catch return error.SaveFailed;
        var next = s.settings.value;
        next.lastDirectory = std.fs.path.dirname(target);
        s.settings.set(s.gpa, next) catch {};
        settings_mod.persist(s.gpa, s.io, s.config_path, s.settings.value) catch
            s.setWarning("Image saved, but the last folder could not be remembered.");
        return .saved;
    }
};

/// "Screenshot-2026-10-20T04-43-07-123Z.png", in UTC.
fn fileName(arena: std.mem.Allocator, io: std.Io) ![]const u8 {
    const ms: u64 = @intCast(@max(0, std.Io.Clock.real.now(io).toMilliseconds()));
    const es: std.time.epoch.EpochSeconds = .{ .secs = ms / 1000 };
    const yd = es.getEpochDay().calculateYearDay();
    const md = yd.calculateMonthDay();
    const ds = es.getDaySeconds();
    return std.fmt.allocPrint(arena, "Screenshot-{d:0>4}-{d:0>2}-{d:0>2}T{d:0>2}-{d:0>2}-{d:0>2}-{d:0>3}Z.png", .{
        yd.year, md.month.numeric(), md.day_index + 1, ds.getHoursIntoDay(), ds.getMinutesIntoHour(), ds.getSecondsIntoMinute(), ms % 1000,
    });
}

/// Messages of the errors raised before a page is there to show them.
pub fn message(err: anyerror) []const u8 {
    return switch (err) {
        error.InvalidShortcuts => "Use two different shortcuts with a modifier and a letter, number or function key.",
        error.ShortcutInUse => "A shortcut is already in use by another app.",
        error.ShortcutRestoreFailed => "Could not restore the shortcuts. Open Settings and choose available shortcuts.",
        else => main.message(err),
    };
}
