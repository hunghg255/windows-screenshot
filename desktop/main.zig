//! Screenshot is a private, local screenshot and annotation tool. Captures
//! stay in memory until the user copies or saves them.
//!
//! Everything here runs on the main thread: bound methods, page events,
//! timers, tray clicks and global shortcuts. Modal dialogs run a nested
//! loop, so the busy flags keep calls from overlapping them.
const std = @import("std");
const myzig = @import("myzig");
const assets = @import("assets");
const geometry = @import("geometry.zig");
const image = @import("image.zig");
const settings = @import("settings.zig");
const win32 = @import("win32.zig");
const service = @import("service.zig");

const Window = myzig.Window;
const Rect = geometry.Rect;

pub const CaptureMode = enum { full, region };

/// The image a capture window shows.
pub const CaptureData = struct {
    id: []const u8,
    image: []const u8,
    width: i32,
    height: i32,
    mode: CaptureMode,
    overlayBounds: ?Rect = null,
};

/// Tells the region overlays the selected desktop rectangle, or null.
pub const SelectionChanged = myzig.Event("selection-changed", ?Rect);

pub const Id = [32]u8;

const Overlay = struct {
    win: *Window,
    bounds: Rect,
    image: []u8,
    ready: bool = false,
};

const Selection = struct {
    owner: *Window,
    start: geometry.Point,
    /// Tells this selection's timer from an earlier one's.
    serial: u32,
};

pub const State = struct {
    app: *myzig.App,
    gpa: std.mem.Allocator,
    io: std.Io,
    dev_url: ?[]const u8 = null,

    settings_window: ?*Window = null,
    settings_shown: bool = false,
    /// The editor, or the first overlay while a region is selected.
    capture_window: ?*Window = null,
    editor_shown: bool = false,
    overlays: std.ArrayList(Overlay) = .empty,
    overlays_shown: bool = false,

    session: ?Id = null,
    image: ?image.Image = null,
    /// The editor's image as a data URL; `data.image` points at it.
    image_url: []u8 = &.{},
    data: ?CaptureData = null,
    layout: ?geometry.Layout = null,
    selection: ?Selection = null,
    serial: u32 = 0,

    settings: settings.Owned,
    warning: std.ArrayList(u8) = .empty,
    config_path: []const u8,
    registered: bool = false,
    host: win32.Host,
    tray: ?*myzig.Tray = null,

    output_busy: bool = false,
    import_busy: bool = false,
    quitting: bool = false,

    fn sessionIs(s: *const State, id: []const u8) bool {
        const cur = s.session orelse return false;
        return std.mem.eql(u8, &cur, id);
    }

    pub fn assertSession(s: *const State, id: []const u8) error{SessionEnded}!void {
        if (id.len == 0 or !s.sessionIs(id) or s.image == null or s.data == null) return error.SessionEnded;
    }

    pub fn setWarning(s: *State, text: []const u8) void {
        s.warning.clearRetainingCapacity();
        s.warning.appendSlice(s.gpa, text) catch {};
    }

    fn addWarning(s: *State, text: []const u8) void {
        if (s.warning.items.len > 0) s.warning.append(s.gpa, ' ') catch {};
        s.warning.appendSlice(s.gpa, text) catch {};
    }

    // Windows.

    fn createWindow(s: *State, view: []const u8, overlay: bool) !*Window {
        const url = if (std.mem.eql(u8, view, "settings")) "/#settings" else if (std.mem.eql(u8, view, "editor")) "/#editor" else "/#region";
        const is_settings = std.mem.eql(u8, view, "settings");
        return s.app.newWindow(.{
            .title = "Screenshot",
            .width = if (is_settings) 680 else 1120,
            .height = if (is_settings) 600 else 780,
            .min_width = if (overlay) 0 else 640,
            .min_height = if (overlay) 0 else 480,
            .visible = false,
            .resizable = !overlay,
            .title_bar = if (overlay) .frameless else .default,
            .skip_taskbar = overlay,
            .always_on_top = overlay,
            .on_close = .{ .ctx = s, .func = closed },
            .on_close_request = if (is_settings) .of(s, State.closeSettings) else null,
            .content = .{ .page = .{ .url = url, .assets = &assets.files, .on_event = .of(s, State.onPage) } },
        });
    }

    pub fn showSettings(s: *State) void {
        if (s.settings_window) |w| {
            w.show();
            w.focus();
            return;
        }
        s.settings_shown = false;
        s.settings_window = s.createWindow("settings", false) catch |err| return report(err);
    }

    fn closeSettings(s: *State, w: *Window) bool {
        if (s.quitting) return true;
        w.hide();
        return false;
    }

    fn showEditor(s: *State) void {
        s.closeCaptureWindows();
        s.editor_shown = false;
        s.capture_window = s.createWindow("editor", false) catch |err| {
            s.clearCapture();
            return report(err);
        };
    }

    /// A window went: forget it, and end its capture.
    fn closed(ctx: *anyopaque, w: *Window) void {
        const s: *State = @ptrCast(@alignCast(ctx));
        if (s.settings_window == w) s.settings_window = null;
        var ours = s.capture_window == w;
        if (ours) s.capture_window = null;
        for (s.overlays.items, 0..) |o, i| if (o.win == w) {
            s.gpa.free(o.image);
            _ = s.overlays.swapRemove(i);
            ours = true;
            break;
        };
        if (ours) if (s.session) |id| s.later(1, id, .clear);
    }

    /// Closes the editor and the overlays. Their `closed` finds them gone.
    fn closeCaptureWindows(s: *State) void {
        s.selection = null;
        var windows: [geometry.Layout.max_displays + 1]*Window = undefined;
        var n: usize = 0;
        for (s.overlays.items) |o| {
            windows[n] = o.win;
            n += 1;
            s.gpa.free(o.image);
        }
        s.overlays.clearRetainingCapacity();
        if (s.capture_window) |w| if (std.mem.indexOfScalar(*Window, windows[0..n], w) == null) {
            windows[n] = w;
            n += 1;
        };
        s.capture_window = null;
        for (windows[0..n]) |w| w.close();
    }

    pub fn clearCapture(s: *State) void {
        s.session = null;
        s.data = null;
        s.layout = null;
        if (s.image) |*img| img.deinit(s.gpa);
        s.image = null;
        s.gpa.free(s.image_url);
        s.image_url = &.{};
        s.closeCaptureWindows();
    }

    fn onPage(s: *State, w: *Window, e: myzig.PageEvent) void {
        switch (e) {
            .will_navigate => |nav| if (!s.ownUrl(nav.url)) {
                nav.cancel = true;
            },
            .new_window => |req| req.handled = true,
            .permission => |req| req.allow = false,
            .dom_ready => s.ready(w),
            .load_failed => if (s.isCaptureWindow(w)) if (s.session) |id| s.later(1, id, .clear),
            else => {},
        }
    }

    fn ready(s: *State, w: *Window) void {
        if (s.settings_window == w and !s.settings_shown) {
            s.settings_shown = true;
            w.show();
            w.focus();
        } else if (s.capture_window == w and s.overlays.items.len == 0 and !s.editor_shown) {
            s.editor_shown = true;
            w.show();
            w.focus();
        } else for (s.overlays.items) |*o| if (o.win == w) {
            o.ready = true;
            s.showOverlays();
        };
    }

    /// The app's own pages, or those of `myzig dev`'s server.
    fn ownUrl(s: *const State, url: []const u8) bool {
        if (std.mem.startsWith(u8, url, "http://myzig.localhost/") or std.mem.startsWith(u8, url, "myzig://")) return true;
        const dev = s.dev_url orelse return false;
        return std.mem.startsWith(u8, url, std.mem.trimEnd(u8, dev, "/"));
    }

    pub fn isCaptureWindow(s: *const State, w: *Window) bool {
        return s.capture_window == w or s.overlayOf(w) != null;
    }

    pub fn overlayOf(s: *const State, w: *Window) ?*Overlay {
        for (s.overlays.items) |*o| if (o.win == w) return o;
        return null;
    }

    // Capturing.

    /// Starts a capture of every display: errors that come before the
    /// screen is copied are the caller's, later ones are reported.
    pub fn beginCapture(s: *State, mode: CaptureMode) !void {
        if (s.session != null) {
            // A new capture replaces the current one, unless the screen is
            // still being copied or a save or import dialog is open.
            if (s.data == null or s.output_busy or s.import_busy) {
                if (s.capture_window) |w| {
                    w.show();
                    w.focus();
                }
                return;
            }
            s.clearCapture();
        }
        const layout = try win32.desktopLayout();
        var id: Id = undefined;
        var raw: [16]u8 = undefined;
        s.io.random(&raw);
        _ = std.fmt.bufPrint(&id, "{x}", .{&raw}) catch unreachable;
        s.session = id;
        s.layout = layout;
        if (s.settings_window) |w| w.hide();
        // Let the settings window disappear before copying the screen.
        s.later(220, id, if (mode == .full) .copy_full else .copy_region);
    }

    fn copyScreen(s: *State, mode: CaptureMode) !void {
        const layout = s.layout.?;
        var frames: [geometry.Layout.max_displays]image.Image = undefined;
        var n: usize = 0;
        defer for (frames[0..n]) |*f| f.deinit(s.gpa);
        for (layout.list()) |d| {
            frames[n] = try win32.captureDisplay(s.gpa, d);
            n += 1;
        }
        var desktop = try image.composite(s.gpa, layout, frames[0..n]);
        const id = s.session.?;
        if (mode == .full) {
            s.image_url = image.pngDataUrl(s.gpa, desktop) catch |err| {
                desktop.deinit(s.gpa);
                return err;
            };
            s.image = desktop;
            s.data = .{ .id = &s.session.?, .image = s.image_url, .width = layout.bounds.width, .height = layout.bounds.height, .mode = .full };
            return s.showEditor();
        }
        // From here clearCapture frees what is made.
        s.image = desktop;
        s.data = .{ .id = &s.session.?, .image = "", .width = layout.bounds.width, .height = layout.bounds.height, .mode = .region };
        s.overlays_shown = false;
        for (layout.list(), frames[0..n]) |d, f| {
            const url = try image.pngDataUrl(s.gpa, f);
            errdefer s.gpa.free(url);
            const w = try s.createWindow("region", true);
            s.overlays.append(s.gpa, .{ .win = w, .bounds = d.bounds, .image = url }) catch |err| {
                w.close();
                return err;
            };
            if (s.capture_window == null) s.capture_window = w;
            if (win32.hwndOf(w)) |h| win32.placeOverlay(h, d.bounds);
        }
        s.later(10_000, id, .overlay_timeout);
    }

    /// Shows the overlays once every one is ready, with the keyboard in the
    /// one under the cursor.
    fn showOverlays(s: *State) void {
        if (s.overlays_shown) return;
        for (s.overlays.items) |o| if (!o.ready) return;
        s.overlays_shown = true;
        const at = win32.cursor();
        var focused = s.capture_window;
        for (s.overlays.items) |o| {
            if (win32.hwndOf(o.win)) |h| {
                win32.placeOverlay(h, o.bounds);
                win32.showInactive(h);
            }
            if (o.bounds.contains(at)) focused = o.win;
        }
        if (focused) |w| w.focus();
    }

    pub fn finishCrop(s: *State, id: []const u8, r: Rect) !void {
        try s.assertSession(id);
        const data = s.data.?;
        var valid = data.mode == .region and s.layout != null and geometry.validRect(r, data.width, data.height);
        if (valid) {
            const layout = s.layout.?;
            valid = false;
            for (layout.list()) |d| valid = valid or geometry.intersects(r, layout.pixels(d.bounds));
        }
        if (!valid) return error.InvalidRegion;
        var cropped = try s.image.?.crop(s.gpa, r);
        errdefer cropped.deinit(s.gpa);
        const url = try image.pngDataUrl(s.gpa, cropped);
        s.image.?.deinit(s.gpa);
        s.image = cropped;
        s.gpa.free(s.image_url);
        s.image_url = url;
        s.data = .{ .id = &s.session.?, .image = url, .width = r.width, .height = r.height, .mode = .full };
        s.showEditor();
    }

    // Selecting a region.

    pub fn startSelection(s: *State, owner: *Window) !void {
        if (s.selection != null) return error.SelectionActive;
        if (!s.displaysUnchanged()) return error.DisplaysChanged;
        s.serial +%= 1;
        const start = win32.cursor();
        s.selection = .{ .owner = owner, .start = start, .serial = s.serial };
        s.broadcastSelection(s.layout.?.region(start, start));
        s.later(16, s.session.?, .selection_tick);
    }

    /// Ends the selection; the rectangle in composite pixels.
    pub fn endSelection(s: *State, owner: *Window) !Rect {
        const sel = s.selection orelse return error.NoSelection;
        if (sel.owner != owner) return error.NoSelection;
        const layout = s.layout.?;
        const r = layout.pixels(layout.region(sel.start, win32.cursor()));
        s.selection = null;
        s.broadcastSelection(null);
        return r;
    }

    fn broadcastSelection(s: *State, r: ?Rect) void {
        for (s.overlays.items) |o| SelectionChanged.emit(o.win, r);
    }

    fn selectionTick(s: *State) void {
        const sel = s.selection orelse return;
        s.broadcastSelection(s.layout.?.region(sel.start, win32.cursor()));
        s.later(16, s.session.?, .selection_tick);
    }

    fn displaysUnchanged(s: *State) bool {
        const now = win32.desktopLayout() catch return false;
        return now.same(&(s.layout orelse return false));
    }

    // Timers.

    const Step = enum { clear, copy_full, copy_region, overlay_timeout, selection_tick };

    const Later = struct {
        state: *State,
        id: Id,
        step: Step,
        serial: u32,

        fn run(ctx: ?*anyopaque) callconv(.c) void {
            const l: *Later = @ptrCast(@alignCast(ctx.?));
            const s = l.state;
            defer s.gpa.destroy(l);
            if (!s.sessionIs(&l.id)) return;
            switch (l.step) {
                .clear => s.clearCapture(),
                .copy_full, .copy_region => s.copyScreen(if (l.step == .copy_full) .full else .region) catch |err| {
                    s.clearCapture();
                    report(err);
                },
                .overlay_timeout => if (!s.overlays_shown) {
                    s.clearCapture();
                    report(error.CaptureTimedOut);
                },
                .selection_tick => if (s.selection) |sel| if (sel.serial == l.serial) s.selectionTick(),
            }
        }
    };

    fn later(s: *State, ms: u64, id: Id, step: Step) void {
        const l = s.gpa.create(Later) catch return;
        l.* = .{ .state = s, .id = id, .step = step, .serial = s.serial };
        myzig.App.after(ms, l, Later.run);
    }

    // The tray, shortcuts and the system.

    fn startFull(s: *State) void {
        s.beginCapture(.full) catch |err| report(err);
    }

    fn startRegion(s: *State) void {
        s.beginCapture(.region) catch |err| report(err);
    }

    fn onHotkey(ctx: *anyopaque, action: settings.Action) void {
        const s: *State = @ptrCast(@alignCast(ctx));
        switch (action) {
            .full => s.startFull(),
            .region => s.startRegion(),
        }
    }

    fn onDisplaysChanged(ctx: *anyopaque) void {
        const s: *State = @ptrCast(@alignCast(ctx));
        const id = s.session orelse return;
        if (s.displaysUnchanged()) return;
        s.later(1, id, .clear);
        report(error.DisplaysChanged);
    }

    fn trayFull(s: *State, _: *myzig.menu.Item) void {
        s.startFull();
    }

    fn trayRegion(s: *State, _: *myzig.menu.Item) void {
        s.startRegion();
    }

    fn traySettings(s: *State, _: *myzig.menu.Item) void {
        s.showSettings();
    }

    fn trayQuit(s: *State, _: *myzig.menu.Item) void {
        s.quitting = true;
        s.app.quit();
    }

    fn secondInstance(s: *State, _: myzig.SecondInstance) void {
        if (s.capture_window) |w| {
            w.show();
            w.focus();
        } else s.showSettings();
    }
};

/// The user-facing message of an error.
pub fn message(err: anyerror) []const u8 {
    return switch (err) {
        error.NoDisplays => "No connected displays.",
        error.InvalidDisplayGeometry => "Invalid display geometry.",
        error.DesktopTooLarge => "The combined desktop is too large (maximum 32 megapixels and 16384 pixels per edge). Reduce display resolution and try again.",
        error.DisplayUnavailable => "The selected display is no longer available.",
        error.CaptureUnavailable => "Screen capture is not available.",
        error.CaptureOutOfMemory, error.OutOfMemory => "Not enough memory to capture the display.",
        error.CaptureIncomplete => "The display did not provide a full-resolution frame.",
        error.CaptureTimedOut => "Screen capture timed out.",
        error.DisplaysChanged => "Display configuration changed. Please capture again.",
        else => "Operation failed. Please try again.",
    };
}

fn report(err: anyerror) void {
    win32.errorBox(message(err));
}

pub fn main(init: std.process.Init) !void {
    win32.perMonitorDpi();
    const gpa = init.gpa;
    const io = init.io;
    var srv: service.Screenshot = .{};
    var holder: Holder = .{};
    const app = try myzig.App.create(init, .{
        .name = "Screenshot",
        .id = "local.windows.screenshot",
        // The app lives in the tray when its windows close.
        .quit_on_last_window_closed = false,
        .on_second_instance = .of(&holder, Holder.second),
    });
    defer app.destroy();
    try app.bind(&srv);
    try app.registerEvent(SelectionChanged);
    if (!app.requestSingleInstanceLock()) return;

    const dir = if (init.environ_map.get("SCREENSHOT_TEST_USER_DATA")) |d| try gpa.dupe(u8, d) else try myzig.appPath(gpa, .data, "Screenshot");
    defer gpa.free(dir);
    const config_path = try std.fs.path.join(gpa, &.{ dir, "settings.json" });
    defer gpa.free(config_path);
    const loaded = try settings.load(gpa, io, config_path);

    var state: State = .{
        .app = app,
        .gpa = gpa,
        .io = io,
        .dev_url = init.environ_map.get("MYZIG_DEV_URL"),
        .settings = loaded.settings,
        .config_path = config_path,
        .host = .{ .ctx = undefined, .on_hotkey = State.onHotkey, .on_displays_changed = State.onDisplaysChanged },
    };
    state.host.ctx = &state;
    defer {
        state.quitting = true;
        state.clearCapture();
        // Its windows go before it does: their `closed` reads it.
        if (state.settings_window) |w| w.close();
        state.host.deinit();
        state.settings.deinit(gpa);
        state.warning.deinit(gpa);
        state.overlays.deinit(gpa);
    }
    srv.state = &state;
    holder.state = &state;
    state.setWarning(loaded.warning);

    // Headless runs (tests, the generated client) take no shortcuts and
    // put no icon in the tray.
    if (!app.headless()) {
        state.host.init() catch |err| state.addWarning(message(err));
        if (settings.replaceShortcuts(&state.host, null, state.settings.value.shortcuts)) {
            state.registered = true;
        } else |err| state.addWarning(service.message(err));
        state.tray = app.newTray(.{
            .icon = @embedFile("tray.png"),
            .tooltip = "Screenshot",
            .menu = &.{
                .{ .label = "Full screen (all displays)", .click = .of(&state, State.trayFull) },
                .{ .label = "Select region across displays", .click = .of(&state, State.trayRegion) },
                .separator,
                .{ .label = "Settings", .click = .of(&state, State.traySettings) },
                .{ .label = "Quit", .click = .of(&state, State.trayQuit) },
            },
        }) catch |err| blk: {
            state.addWarning(@errorName(err));
            break :blk null;
        };
    }
    state.showSettings();
    try app.run();
}

/// Reaches the state from `AppOptions`, which are given before it exists.
pub const Holder = struct {
    state: ?*State = null,

    fn second(h: *Holder, si: myzig.SecondInstance) void {
        if (h.state) |s| s.secondInstance(si);
    }
};

test {
    _ = geometry;
    _ = image;
    _ = settings;
    _ = win32;
}
