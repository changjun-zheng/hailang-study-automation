$targets = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*runner.mjs*' -or $_.CommandLine -like '*supervise.mjs*' }
if (-not $targets) { Write-Output '没有 runner/supervise 进程在跑'; exit 0 }
foreach ($p in $targets) { Write-Output ("停止 PID " + $p.ProcessId + " :: " + $p.CommandLine); Stop-Process -Id $p.ProcessId -Force }
