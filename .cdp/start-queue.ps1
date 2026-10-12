# Launch the queue detached from this CLI session's process tree.
# Why: runs started via the agent's background shell die when the session ends
# (observed 19:42: queue/supervise/runner and Chrome all vanished mid-course).
#   powershell -NoProfile -File .cdp/start-queue.ps1
#   powershell -NoProfile -File .cdp/start-queue.ps1 -DryRun
# NOTE: keep this file ASCII-only. Windows PowerShell 5.1 reads BOM-less UTF-8 as
# ANSI, and some bytes of Chinese text get misdecoded as quote characters, which
# breaks parsing with TerminatorExpectedAtEndOfString.
param([switch]$DryRun)
$root = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node.exe).Source
# Start-Process redirect truncates, it does not append. queue.log holds the
# before/after evidence for the liveness fix, so write to a new file instead.
$log = Join-Path $root 'queue.out.log'
$errLog = Join-Path $root 'queue.err.log'
# $args is a read-only automatic variable inside a param() script.
$nodeArgs = '.cdp/queue.mjs'
if ($DryRun) { $nodeArgs = '.cdp/queue.mjs --dry' }
$p = Start-Process -FilePath $node -ArgumentList $nodeArgs -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError $errLog -PassThru
if ($p) { Write-Output ("queue started detached, PID=" + $p.Id) } else { Write-Output 'start failed: no process object' }
