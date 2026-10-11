$targets = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
  $cl = $_.CommandLine
  -not ($cl -like '*chrome-devtools*') -and ($cl -like '*queue.mjs*' -or $cl -like '*supervise.mjs*' -or $cl -like '*runner.mjs*')
}
if (-not $targets) { Write-Output '没有 queue/supervise/runner 进程在跑'; exit 0 }
foreach ($p in $targets) {
  Write-Output ("停止 PID " + $p.ProcessId + " :: " + $p.CommandLine)
  Stop-Process -Id $p.ProcessId -Force
}
