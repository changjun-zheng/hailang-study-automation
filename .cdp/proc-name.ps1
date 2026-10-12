param([int]$ProcessId)
$p = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId"
if ($p) { Write-Output $p.Name } else { Write-Output '' }
