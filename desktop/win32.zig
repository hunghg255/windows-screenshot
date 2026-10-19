//! What the app asks of Win32 directly: displays and their pixels, the
//! cursor, global shortcuts with every key and modifier the settings allow,
//! display changes, and overlays placed in physical pixels.
const std = @import("std");
const geometry = @import("geometry.zig");
const image = @import("image.zig");
const settings = @import("settings.zig");

pub const HWND = *anyopaque;
const HANDLE = ?*anyopaque;
const BOOL = i32;
const WPARAM = usize;
const LPARAM = isize;
const LRESULT = isize;

const RECT = extern struct { left: i32 = 0, top: i32 = 0, right: i32 = 0, bottom: i32 = 0 };
const POINT = extern struct { x: i32 = 0, y: i32 = 0 };
const MONITORINFO = extern struct { cbSize: u32 = @sizeOf(MONITORINFO), rcMonitor: RECT = .{}, rcWork: RECT = .{}, dwFlags: u32 = 0 };
const BITMAPINFOHEADER = extern struct {
    biSize: u32 = @sizeOf(BITMAPINFOHEADER),
    biWidth: i32,
    biHeight: i32,
    biPlanes: u16 = 1,
    biBitCount: u16 = 32,
    biCompression: u32 = 0,
    biSizeImage: u32 = 0,
    biXPelsPerMeter: i32 = 0,
    biYPelsPerMeter: i32 = 0,
    biClrUsed: u32 = 0,
    biClrImportant: u32 = 0,
};
const WNDPROC = *const fn (HWND, u32, WPARAM, LPARAM) callconv(.winapi) LRESULT;
const WNDCLASSEXW = extern struct {
    cbSize: u32 = @sizeOf(WNDCLASSEXW),
    style: u32 = 0,
    lpfnWndProc: WNDPROC,
    cbClsExtra: i32 = 0,
    cbWndExtra: i32 = 0,
    hInstance: HANDLE,
    hIcon: HANDLE = null,
    hCursor: HANDLE = null,
    hbrBackground: HANDLE = null,
    lpszMenuName: ?[*:0]const u16 = null,
    lpszClassName: [*:0]const u16,
    hIconSm: HANDLE = null,
};
const GUID = extern struct { a: u32, b: u16, c: u16, d: [8]u8 };
const MONITORENUMPROC = *const fn (HANDLE, HANDLE, *RECT, LPARAM) callconv(.winapi) BOOL;

extern "user32" fn EnumDisplayMonitors(hdc: HANDLE, clip: ?*const RECT, proc: MONITORENUMPROC, data: LPARAM) callconv(.winapi) BOOL;
extern "user32" fn GetMonitorInfoW(monitor: HANDLE, info: *MONITORINFO) callconv(.winapi) BOOL;
extern "user32" fn GetDC(hwnd: ?HWND) callconv(.winapi) HANDLE;
extern "user32" fn ReleaseDC(hwnd: ?HWND, dc: HANDLE) callconv(.winapi) i32;
extern "gdi32" fn CreateCompatibleDC(dc: HANDLE) callconv(.winapi) HANDLE;
extern "gdi32" fn CreateDIBSection(dc: HANDLE, info: *const BITMAPINFOHEADER, usage: u32, bits: *?[*]u8, section: HANDLE, offset: u32) callconv(.winapi) HANDLE;
extern "gdi32" fn SelectObject(dc: HANDLE, obj: HANDLE) callconv(.winapi) HANDLE;
extern "gdi32" fn BitBlt(dst: HANDLE, x: i32, y: i32, w: i32, h: i32, src: HANDLE, sx: i32, sy: i32, rop: u32) callconv(.winapi) BOOL;
extern "gdi32" fn DeleteObject(obj: HANDLE) callconv(.winapi) BOOL;
extern "gdi32" fn DeleteDC(dc: HANDLE) callconv(.winapi) BOOL;
extern "user32" fn GetCursorPos(p: *POINT) callconv(.winapi) BOOL;
extern "user32" fn SetProcessDpiAwarenessContext(ctx: isize) callconv(.winapi) BOOL;
extern "user32" fn MessageBoxW(hwnd: ?HWND, text: [*:0]const u16, caption: [*:0]const u16, kind: u32) callconv(.winapi) i32;
extern "user32" fn SetWindowPos(hwnd: HWND, after: isize, x: i32, y: i32, w: i32, h: i32, flags: u32) callconv(.winapi) BOOL;
extern "user32" fn SetWindowLongPtrW(hwnd: HWND, index: i32, value: isize) callconv(.winapi) isize;
extern "user32" fn GetWindowLongPtrW(hwnd: HWND, index: i32) callconv(.winapi) isize;
extern "user32" fn ShowWindow(hwnd: HWND, cmd: i32) callconv(.winapi) BOOL;
extern "user32" fn RegisterHotKey(hwnd: ?HWND, id: i32, mods: u32, vk: u32) callconv(.winapi) BOOL;
extern "user32" fn UnregisterHotKey(hwnd: ?HWND, id: i32) callconv(.winapi) BOOL;
extern "user32" fn RegisterClassExW(wc: *const WNDCLASSEXW) callconv(.winapi) u16;
extern "user32" fn CreateWindowExW(ex: u32, class: [*:0]const u16, title: [*:0]const u16, style: u32, x: i32, y: i32, w: i32, h: i32, parent: ?HWND, menu: HANDLE, inst: HANDLE, param: ?*anyopaque) callconv(.winapi) ?HWND;
extern "user32" fn DestroyWindow(hwnd: HWND) callconv(.winapi) BOOL;
extern "user32" fn DefWindowProcW(hwnd: HWND, msg: u32, wp: WPARAM, lp: LPARAM) callconv(.winapi) LRESULT;
extern "kernel32" fn GetModuleHandleW(name: ?[*:0]const u16) callconv(.winapi) HANDLE;
extern "shell32" fn SHGetKnownFolderPath(id: *const GUID, flags: u32, token: HANDLE, path: *?[*:0]u16) callconv(.winapi) i32;
extern "ole32" fn CoTaskMemFree(p: ?*anyopaque) callconv(.winapi) void;

/// Makes the process per-monitor aware (v2) before any window exists, so
/// that every display's coordinates are its physical pixels. A manifest
/// that already says so makes this fail harmlessly.
pub fn perMonitorDpi() void {
    _ = SetProcessDpiAwarenessContext(-4);
}

// Displays.

const Enum = struct { out: []geometry.Display, n: usize = 0, overflow: bool = false };

fn onMonitor(monitor: HANDLE, _: HANDLE, r: *RECT, data: LPARAM) callconv(.winapi) BOOL {
    const e: *Enum = @ptrFromInt(@as(usize, @bitCast(data)));
    if (e.n == e.out.len) {
        e.overflow = true;
        return 0;
    }
    e.out[e.n] = .{ .id = @intFromPtr(monitor), .bounds = .{ .x = r.left, .y = r.top, .width = r.right - r.left, .height = r.bottom - r.top } };
    e.n += 1;
    return 1;
}

/// The connected displays, primary first, as a layout.
pub fn desktopLayout() geometry.LayoutError!geometry.Layout {
    var buf: [geometry.Layout.max_displays]geometry.Display = undefined;
    var e: Enum = .{ .out = &buf };
    _ = EnumDisplayMonitors(null, null, onMonitor, @bitCast(@intFromPtr(&e)));
    if (e.overflow) return error.InvalidDisplayGeometry;
    // The primary display's top left is the desktop's origin.
    for (buf[0..e.n], 0..) |d, i| if (d.bounds.x == 0 and d.bounds.y == 0) {
        std.mem.swap(geometry.Display, &buf[0], &buf[i]);
        break;
    };
    return geometry.Layout.init(buf[0..e.n]);
}

pub const CaptureError = error{ DisplayUnavailable, CaptureUnavailable, CaptureOutOfMemory, CaptureIncomplete };

/// Copies one display at its physical resolution.
pub fn captureDisplay(gpa: std.mem.Allocator, d: geometry.Display) CaptureError!image.Image {
    var info: MONITORINFO = .{};
    if (GetMonitorInfoW(@ptrFromInt(d.id), &info) == 0) return error.DisplayUnavailable;
    const m = info.rcMonitor;
    const width = m.right - m.left;
    const height = m.bottom - m.top;
    if (width <= 0 or height <= 0) return error.DisplayUnavailable;
    const screen = GetDC(null) orelse return error.CaptureUnavailable;
    defer _ = ReleaseDC(null, screen);
    const memory = CreateCompatibleDC(screen) orelse return error.CaptureUnavailable;
    defer _ = DeleteDC(memory);
    // A negative height makes the bitmap top-down.
    const header: BITMAPINFOHEADER = .{ .biWidth = width, .biHeight = -height };
    var bits: ?[*]u8 = null;
    const bitmap = CreateDIBSection(memory, &header, 0, &bits, null, 0) orelse return error.CaptureOutOfMemory;
    defer _ = DeleteObject(bitmap);
    const px = bits orelse return error.CaptureOutOfMemory;
    const old = SelectObject(memory, bitmap);
    defer _ = SelectObject(memory, old);
    const srccopy = 0x00CC0020;
    const captureblt = 0x40000000;
    if (BitBlt(memory, 0, 0, width, height, screen, m.left, m.top, srccopy | captureblt) == 0) return error.CaptureIncomplete;
    var img = image.Image.alloc(gpa, @intCast(width), @intCast(height)) catch return error.CaptureOutOfMemory;
    @memcpy(img.bgra, px[0..img.bgra.len]);
    var i: usize = 3;
    while (i < img.bgra.len) : (i += 4) img.bgra[i] = 255;
    return img;
}

pub fn cursor() geometry.Point {
    var p: POINT = .{};
    _ = GetCursorPos(&p);
    return .{ .x = p.x, .y = p.y };
}

// Windows of myzig.

/// The HWND of a myzig window, or null when it has none (headless).
pub fn hwndOf(win: anytype) ?HWND {
    const h = win.hwnd orelse return null;
    return @ptrCast(h);
}

/// Makes a window a borderless, topmost popup covering `r`, in pixels.
/// It moves first and then sizes, so that a change of DPI on the way to
/// another display doesn't change its size.
pub fn placeOverlay(hwnd: HWND, r: geometry.Rect) void {
    const gwl_style = -16;
    const gwl_exstyle = -20;
    const ws_popup: isize = @bitCast(@as(usize, 0x80000000));
    const ws_clipchildren: isize = 0x02000000;
    const ws_visible: isize = 0x10000000;
    const style = GetWindowLongPtrW(hwnd, gwl_style);
    _ = SetWindowLongPtrW(hwnd, gwl_style, ws_popup | ws_clipchildren | (style & ws_visible));
    const ws_ex_toolwindow = 0x80;
    const ws_ex_topmost = 0x8;
    _ = SetWindowLongPtrW(hwnd, gwl_exstyle, GetWindowLongPtrW(hwnd, gwl_exstyle) | ws_ex_toolwindow | ws_ex_topmost);
    const topmost: isize = -1;
    const nosize = 0x1;
    const noactivate = 0x10;
    const framechanged = 0x20;
    _ = SetWindowPos(hwnd, topmost, r.x, r.y, 0, 0, nosize | noactivate | framechanged);
    _ = SetWindowPos(hwnd, topmost, r.x, r.y, r.width, r.height, noactivate);
}

/// Shows a window without activating it.
pub fn showInactive(hwnd: HWND) void {
    _ = ShowWindow(hwnd, 4); // SW_SHOWNOACTIVATE
}

pub fn errorBox(text: []const u8) void {
    var buf: [1024]u16 = undefined;
    const n = std.unicode.utf8ToUtf16Le(buf[0 .. buf.len - 1], text[0..@min(text.len, 600)]) catch 0;
    buf[n] = 0;
    const mb_iconerror = 0x10;
    const mb_setforeground = 0x10000;
    _ = MessageBoxW(null, buf[0..n :0], std.unicode.utf8ToUtf16LeStringLiteral("Screenshot"), mb_iconerror | mb_setforeground);
}

/// The user's Pictures folder. Caller frees it.
pub fn picturesDir(gpa: std.mem.Allocator) ?[]u8 {
    const folderid_pictures: GUID = .{ .a = 0x33E28130, .b = 0x4E1E, .c = 0x4676, .d = .{ 0x83, 0x5A, 0x98, 0x39, 0x5C, 0x3B, 0xC3, 0xBB } };
    var path: ?[*:0]u16 = null;
    defer CoTaskMemFree(path);
    if (SHGetKnownFolderPath(&folderid_pictures, 0, null, &path) != 0) return null;
    return std.unicode.utf16LeToUtf8Alloc(gpa, std.mem.span(path orelse return null)) catch null;
}

// Global shortcuts and display changes.

/// A hidden window that hears global shortcuts and display changes; myzig's
/// event loop dispatches its messages on the main thread.
pub const Host = struct {
    hwnd: ?HWND = null,
    ctx: *anyopaque,
    on_hotkey: *const fn (ctx: *anyopaque, action: settings.Action) void,
    on_displays_changed: *const fn (ctx: *anyopaque) void,

    const class = std.unicode.utf8ToUtf16LeStringLiteral("ScreenshotHost");
    const wm_hotkey = 0x0312;
    const wm_displaychange = 0x007E;
    const gwlp_userdata = -21;

    /// Makes the window; `host` must stay where it is until `deinit`.
    pub fn init(host: *Host) !void {
        const inst = GetModuleHandleW(null);
        const wc: WNDCLASSEXW = .{ .lpfnWndProc = wndProc, .hInstance = inst, .lpszClassName = class };
        _ = RegisterClassExW(&wc);
        // A top-level window: message-only windows get no WM_DISPLAYCHANGE.
        const hwnd = CreateWindowExW(0x80, class, class, 0x80000000, 0, 0, 0, 0, null, null, inst, null) orelse return error.CreateWindow;
        _ = SetWindowLongPtrW(hwnd, gwlp_userdata, @bitCast(@intFromPtr(host)));
        host.hwnd = hwnd;
    }

    pub fn deinit(host: *Host) void {
        const h = host.hwnd orelse return;
        host.unregister(.full);
        host.unregister(.region);
        _ = DestroyWindow(h);
        host.hwnd = null;
    }

    fn wndProc(hwnd: HWND, msg: u32, wp: WPARAM, lp: LPARAM) callconv(.winapi) LRESULT {
        const ptr: usize = @bitCast(GetWindowLongPtrW(hwnd, gwlp_userdata));
        if (ptr != 0) {
            const host: *Host = @ptrFromInt(ptr);
            switch (msg) {
                wm_hotkey => {
                    if (wp == 1) host.on_hotkey(host.ctx, .full);
                    if (wp == 2) host.on_hotkey(host.ctx, .region);
                    return 0;
                },
                wm_displaychange => host.on_displays_changed(host.ctx),
                else => {},
            }
        }
        return DefWindowProcW(hwnd, msg, wp, lp);
    }

    /// Registers a valid shortcut ("Ctrl+Alt+F") for an action.
    /// Without its window (headless runs) nothing is registered.
    pub fn register(host: *Host, action: settings.Action, shortcut: []const u8) !void {
        const k = keys(shortcut) orelse return error.UnsupportedKey;
        const h = host.hwnd orelse return;
        if (RegisterHotKey(h, id(action), k.mods, k.vk) == 0) return error.Unavailable;
    }

    pub fn unregister(host: *Host, action: settings.Action) void {
        const h = host.hwnd orelse return;
        _ = UnregisterHotKey(h, id(action));
    }

    fn id(action: settings.Action) i32 {
        return @as(i32, @backingInt(action)) + 1;
    }
};

const Keys = struct { mods: u32, vk: u32 };

/// RegisterHotKey's modifiers and virtual key of a valid shortcut.
fn keys(shortcut: []const u8) ?Keys {
    var k: Keys = .{ .mods = 0x4000, .vk = 0 }; // MOD_NOREPEAT
    var it = std.mem.splitScalar(u8, shortcut, '+');
    while (it.next()) |p| {
        const eql = std.mem.eql;
        if (eql(u8, p, "Alt")) k.mods |= 0x1 //
        else if (eql(u8, p, "Ctrl")) k.mods |= 0x2 //
        else if (eql(u8, p, "Shift")) k.mods |= 0x4 //
        else if (eql(u8, p, "Super")) k.mods |= 0x8 //
        else if (eql(u8, p, "PrintScreen")) k.vk = 0x2C //
        else if (p.len == 1) k.vk = p[0] //
        else if (p.len > 1 and p[0] == 'F') k.vk = 0x6F + (std.fmt.parseInt(u32, p[1..], 10) catch return null) //
        else return null;
    }
    return if (k.vk == 0) null else k;
}

test "shortcuts become RegisterHotKey's keys" {
    try std.testing.expectEqual(Keys{ .mods = 0x4003, .vk = 'F' }, keys("Ctrl+Alt+F").?);
    try std.testing.expectEqual(Keys{ .mods = 0x400C, .vk = 0x2C }, keys("Shift+Super+PrintScreen").?);
    try std.testing.expectEqual(Keys{ .mods = 0x4002, .vk = 0x70 }, keys("Ctrl+F1").?);
    try std.testing.expectEqual(Keys{ .mods = 0x4001, .vk = 0x87 }, keys("Alt+F24").?);
    try std.testing.expectEqual(Keys{ .mods = 0x4002, .vk = '7' }, keys("Ctrl+7").?);
}
