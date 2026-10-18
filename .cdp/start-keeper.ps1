param(
  [string]$Port = '9226',
  [string]$MaxHours = '10',
  [switch]$Keep
)
# Start the keeper detached. A background shell started through the agent's own
# proxy dies when the session ends (it takes the browser with it), so use Start-Process.
# Keep this file ASCII-only: Windows PowerShell 5.1 reads BOM-less UTF-8 as ANSI and
# a Chinese comment here breaks parsing silently.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) { Write-Output 'NODE_NOT_FOUND'; exit 1 }
$node = $nodeCmd.Source
$logDir = Join-Path $root '.cdp\logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$out = Join-Path $logDir ('keeper-' + $Port + '.out.log')
$errf = Join-Path $logDir ('keeper-' + $Port + '.err.log')
$script = Join-Path $root '.cdp\inject-keeper.mjs'
if (-not (Test-Path $script)) { Write-Output 'KEEPER_SCRIPT_NOT_FOUND'; exit 1 }
$argList = @(('"' + $script + '"'), '--cdp', ('"http://127.0.0.1:' + $Port + '"'), '--max-hours', $MaxHours)
if ($Keep) { $argList += '--keep' }
try {
  $p = Start-Process -FilePath $node -ArgumentList $argList -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $errf -PassThru
  Write-Output ('KEEPER_PID=' + $p.Id)
  Write-Output ('KEEPER_OUT=' + $out)
} catch {
  Write-Output ('KEEPER_START_FAILED=' + $_.Exception.Message)
  exit 2
}
