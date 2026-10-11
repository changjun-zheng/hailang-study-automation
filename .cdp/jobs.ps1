$targets = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
  $cl = $_.CommandLine
  ($cl -like '*queue.mjs*' -or $cl -like '*supervise.mjs*' -or $cl -like '*runner.mjs*')
}
if (-not $targets) { Write-Output '没有 queue/supervise/runner 在跑'; exit 0 }
foreach ($p in $targets) { Write-Output ("PID " + $p.ProcessId + " :: " + $p.CommandLine) }
