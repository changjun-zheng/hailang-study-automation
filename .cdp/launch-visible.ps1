$chrome = "C:\Users\ME\AppData\Local\Google\Chrome\Application\chrome.exe"
$profile = "C:\Users\ME\.hailang-chrome-profile"
$args = @(
  '--remote-debugging-port=9224',
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
  'https://study.cqie.edu.cn/login'
)
Start-Process -FilePath $chrome -ArgumentList $args
Start-Sleep -Seconds 5
try {
  $v = Invoke-RestMethod -Uri 'http://127.0.0.1:9224/json/version' -TimeoutSec 6
  Write-Output ("CDP_READY " + $v.Browser)
} catch {
  Write-Output "CDP_NOT_READY"
}
