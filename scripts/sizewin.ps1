# Edge remembers the last app-window size and ignores --window-size, so resize the window after it opens.
param([int]$W = 650, [int]$H = 1200)
Add-Type @"
using System;using System.Runtime.InteropServices;
public class WinSize{[DllImport("user32.dll")]public static extern bool SetWindowPos(IntPtr h,IntPtr a,int x,int y,int w,int ht,uint f);}
"@
for ($i = 0; $i -lt 30; $i++) {
  $p = Get-Process msedge -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like 'Voyager*' } | Select-Object -First 1
  if ($p) { [WinSize]::SetWindowPos($p.MainWindowHandle, [IntPtr]::Zero, 100, 20, $W, $H, 0x0004) | Out-Null; break }
  Start-Sleep -Milliseconds 300
}
