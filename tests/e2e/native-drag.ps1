param([int]$StartX, [int]$StartY, [int]$EndX, [int]$EndY)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ScreenshotDrag {
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
}
'@
[ScreenshotDrag]::SetProcessDpiAwarenessContext([IntPtr](-4)) | Out-Null
[ScreenshotDrag]::SetCursorPos($StartX, $StartY) | Out-Null
Start-Sleep -Milliseconds 150
[ScreenshotDrag]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
try {
  for ($step = 1; $step -le 30; $step++) {
    [ScreenshotDrag]::SetCursorPos([int]($StartX + ($EndX - $StartX) * $step / 30), [int]($StartY + ($EndY - $StartY) * $step / 30)) | Out-Null
    Start-Sleep -Milliseconds 20
  }
} finally { [ScreenshotDrag]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero) }
