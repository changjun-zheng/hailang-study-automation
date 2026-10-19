param([string]$Url)
$chrome = "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
$profile = "$env:USERPROFILE\.hailang-chrome-profile"
$args = @(
  '--headless=new',
  '--remote-debugging-port=9224',
  '--remote-debugging-address=127.0.0.1',
  "--user-data-dir=$profile",
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--window-size=1440,900',
  '--autoplay-policy=no-user-gesture-required',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling',
  '--disable-features=CalculateNativeWinOcclusion'
)
if ($Url) { $args += $Url }
Start-Process -FilePath $chrome -ArgumentList $args
Start-Sleep -Seconds 8
try {
  $v = Invoke-RestMethod -Uri 'http://127.0.0.1:9224/json/version' -TimeoutSec 8
  Write-Output ("CDP_READY " + $v.Browser)
} catch {
  Write-Output "CDP_NOT_READY"
}
