$targets = Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*hailang-chrome-profile*' }
if (-not $targets) { Write-Output '没有本项目的专用 Chrome 在跑'; exit 0 }
foreach ($p in $targets) { Write-Output ("停止 PID " + $p.ProcessId); Stop-Process -Id $p.ProcessId -Force }
