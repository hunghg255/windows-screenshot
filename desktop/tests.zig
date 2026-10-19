//! The desktop's unit tests: `zig build test`.
test {
    _ = @import("geometry.zig");
    _ = @import("image.zig");
    _ = @import("settings.zig");
    _ = @import("win32.zig");
}
