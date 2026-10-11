$ps = Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object {
  $_.CommandLine -like '*hailang-chrome-profile*' -and $_.CommandLine -notlike '*--type=*'
}
if (-not $ps) { Write-Output 'NO_MAIN_CHROME'; exit 0 }
foreach ($x in $ps) {
  Write-Output ("MAIN PID " + $x.ProcessId)
  ($x.CommandLine -split ' --') | ForEach-Object { Write-Output ("  --" + $_.Trim()) }
}
