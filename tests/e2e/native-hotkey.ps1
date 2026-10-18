param([int]$X, [int]$Y, [int]$VirtualKey = 0)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ScreenshotInput {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
}
'@
if ($VirtualKey -eq 0) { [ScreenshotInput]::SetCursorPos($X, $Y) | Out-Null; exit }
Add-Type -AssemblyName System.Windows.Forms
$taskForm = New-Object System.Windows.Forms.Form
$taskForm.Text = 'Screenshot hotkey verification'
$taskForm.StartPosition = 'Manual'
$taskForm.Location = New-Object System.Drawing.Point(30, 30)
$taskForm.ClientSize = New-Object System.Drawing.Size(340, 80)
try {
  $taskForm.Show(); $taskForm.Activate()
  [System.Windows.Forms.Application]::DoEvents()
  Start-Sleep -Milliseconds 200
  [uint32]$taskForegroundPid = 0
  [ScreenshotInput]::GetWindowThreadProcessId([ScreenshotInput]::GetForegroundWindow(), [ref]$taskForegroundPid) | Out-Null
  [ScreenshotInput]::SetCursorPos($X, $Y) | Out-Null
  foreach ($taskKey in @(17, 18, 16, $VirtualKey)) { [ScreenshotInput]::keybd_event([byte]$taskKey, 0, 0, [UIntPtr]::Zero) }
  foreach ($taskKey in @($VirtualKey, 16, 18, 17)) { [ScreenshotInput]::keybd_event([byte]$taskKey, 0, 2, [UIntPtr]::Zero) }
  Start-Sleep -Milliseconds 300
  [pscustomobject]@{ foregroundProcess = $taskForegroundPid; injected = $true } | ConvertTo-Json -Compress
} finally {
  foreach ($taskKey in @($VirtualKey, 16, 18, 17)) { [ScreenshotInput]::keybd_event([byte]$taskKey, 0, 2, [UIntPtr]::Zero) }
  $taskForm.Close(); $taskForm.Dispose()
}
