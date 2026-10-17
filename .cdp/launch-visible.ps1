param(
  [string]$Url = 'https://study.cqie.edu.cn/login',
  [int]$Port = 9224,
  [string]$ProfileDir = "$env:USERPROFILE\.hailang-chrome-profile"
)
$candidates = @(
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
)
$chrome = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { Write-Output 'CHROME_NOT_FOUND'; exit 1 }
$profile = $ProfileDir
$args = @(
  "--remote-debugging-port=$Port",
  '--remote-debugging-address=127.0.0.1',
  "--user-data-dir=$profile",
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-backgrounding-occluded-windows',
  '--disable-features=CalculateNativeWinOcclusion',
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling',
  '--autoplay-policy=no-user-gesture-required',
  '--window-position=120,80',
  '--window-size=1200,860',
  $Url
)
Start-Process -FilePath $chrome -ArgumentList $args
Start-Sleep -Seconds 5
try {
  $v = Invoke-RestMethod -Uri ("http://127.0.0.1:" + $Port + "/json/version") -TimeoutSec 6
  Write-Output ("CDP_READY port=" + $Port + " profile=" + $profile + " " + $v.Browser)
} catch {
  Write-Output ("CDP_NOT_READY port=" + $Port)
}
