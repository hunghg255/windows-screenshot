const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});
    // Set by `myzig build`: release builds without debug information, and
    // Windows' icon, manifest and version information.
    const strip = b.option(bool, "strip", "Strip debug information");
    const win32_res = b.option([]const u8, "win32-res", "A compiled resource file (.res) to link on Windows");
    // The built frontend, embedded into the app (`myzig_assets.zig` lists
    // its files; `myzig generate`, dev and build write it).
    const frontend = b.option([]const u8, "frontend", "The directory of the built frontend") orelse "dist";

    const myzig = b.dependency("myzig", .{ .target = target, .optimize = optimize }).module("myzig");
    const root = b.createModule(.{
        .root_source_file = b.path("desktop/main.zig"),
        .target = target,
        .optimize = optimize,
        .strip = strip,
        .imports = &.{.{ .name = "myzig", .module = myzig }},
    });
    root.addImport("assets", b.createModule(.{
        .root_source_file = b.path(b.fmt("{s}/myzig_assets.zig", .{frontend})),
        .imports = &.{.{ .name = "myzig", .module = myzig }},
    }));
    if (win32_res) |res| if (target.result.os.tag == .windows) root.addObjectFile(.{ .cwd_relative = res });

    const exe = b.addExecutable(.{ .name = "screenshot", .root_module = root });
    // Set by `myzig build`: a Windows app that opens no console.
    if (b.option(bool, "windows-gui", "A Windows app without a console") orelse false) exe.subsystem = .windows;
    b.installArtifact(exe);

    const run = b.addRunArtifact(exe);
    run.addPassthruArgs();
    b.step("run", "Run the app").dependOn(&run.step);

    // The desktop's own code, without myzig or the frontend.
    const tests = b.addTest(.{ .root_module = b.createModule(.{
        .root_source_file = b.path("desktop/tests.zig"),
        .target = target,
        .optimize = optimize,
    }) });
    b.step("test", "Run the desktop tests").dependOn(&b.addRunArtifact(tests).step);
}
