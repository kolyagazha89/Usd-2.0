#Requires -Version 5.1
<#
 Windows one-click USD LAN DEMO. Real-event reverse sync is NOT implemented.
 All Docker actions use the independent usd-venue Compose project.
#>
param(
 [ValidateSet('UI','SetupDemo','Start','Online','TrustCA')][string]$Mode='UI',
 [string]$LanIp=''
)
$ErrorActionPreference='Stop'
$script:Root=Split-Path -Parent $MyInvocation.MyCommand.Path
function Ensure-DockerAndNode {
 if(-not (Get-Command node.exe -ErrorAction SilentlyContinue)){
  if(-not (Get-Command winget.exe -ErrorAction SilentlyContinue)){
   throw 'Установите Node.js 22+ и Docker Desktop. Winget недоступен.'
  }
  & winget.exe install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
  if($LASTEXITCODE -ne 0){throw 'Node.js не установлен.'}
  throw 'Node.js установлен. Перезапустите панель для обновления PATH.'
 }
 $version=& node.exe --version
 if([int](($version -replace '^v','').Split('.')[0]) -lt 22){
  throw 'Нужен Node.js версии 22 или новее.'
 }
 if(-not (Get-Command docker.exe -ErrorAction SilentlyContinue)){
  if(-not (Get-Command winget.exe -ErrorAction SilentlyContinue)){throw 'Установите Docker Desktop с WSL2.'}
  & winget.exe install --id Docker.DockerDesktop -e --accept-package-agreements --accept-source-agreements
  if($LASTEXITCODE -ne 0){throw 'Docker Desktop не установлен.'}
  throw 'Docker установлен. При необходимости перезагрузите Windows, затем нажмите кнопку снова.'
 }
 & docker.exe info --format '{{.ServerVersion}}' 2>$null | Out-Null
 if($LASTEXITCODE -ne 0){
  $desktop=Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
  if(Test-Path $desktop){
   Start-Process -FilePath $desktop | Out-Null
   for($i=0;$i -lt 60;$i++){
    Start-Sleep -Seconds 2
    & docker.exe info --format '{{.ServerVersion}}' 2>$null | Out-Null
    if($LASTEXITCODE -eq 0){break}
   }
  }
  if($LASTEXITCODE -ne 0){throw 'Docker недоступен: проверьте WSL2/виртуализацию.'}
 }
}
function Run-Demo([string[]]$RunnerArgs){
 Ensure-DockerAndNode
 & node.exe (Join-Path $script:Root 'one-click-runner.mjs') @RunnerArgs
 if($LASTEXITCODE -ne 0){throw 'Операция не завершена. Данные не удалялись.'}
}
function Trust-LocalCA {
 Ensure-DockerAndNode
 if(-not (Test-Path (Join-Path $script:Root '.venue-oneclick-demo\.ready'))){
  throw 'Сначала установите демо.'
 }
 $ca=Join-Path $script:Root '.venue-oneclick-demo\usd-venue-local-ca.crt'
 $args=@('compose','-p','usd-venue','-f',(Join-Path $script:Root 'compose.yaml'),
  '--env-file',(Join-Path $script:Root '.env'),'cp',
  'gateway:/data/caddy/pki/authorities/local/root.crt',$ca)
 & docker.exe @args
 if($LASTEXITCODE -ne 0){throw 'Не удалось извлечь CA.'}
 Write-Host 'ВНИМАНИЕ: корневой CA способен подписывать любые HTTPS-сайты.' -ForegroundColor Yellow
 $confirmation=Read-Host 'Для установки сертификата ТОЛЬКО на этот Windows введите ДОВЕРЯЮ'
 if($confirmation -ne 'ДОВЕРЯЮ'){throw 'Отменено'}
 & certutil.exe -user -addstore Root $ca
 if($LASTEXITCODE -ne 0){throw 'Сертификат не установлен.'}
 Write-Host 'На телефонах необходимо доверять CA отдельно.' -ForegroundColor Green
}
if($Mode -ne 'UI'){
 $failed=$false
 try{
  Set-Location $script:Root
  switch($Mode){
   'SetupDemo'{
    if($LanIp -notmatch '^\d{1,3}(\.\d{1,3}){3}$'){throw 'Неверный LAN IPv4.'}
    Run-Demo -RunnerArgs @('install-demo',$LanIp)
    Start-Process ('https://'+$LanIp+'/venue/live')
   }
   'Start'{
    Run-Demo -RunnerArgs @('start')
    $ipLine=Get-Content (Join-Path $script:Root '.env') |
      Where-Object {$_ -match '^VENUE_BIND_IP='} | Select-Object -First 1
    Start-Process ('https://'+$ipLine.Substring('VENUE_BIND_IP='.Length)+'/venue/live')
   }
   'Online'{
    Run-Demo -RunnerArgs @('stop')
    Start-Process 'https://app.usd-russia.ru'
   }
   'TrustCA'{Trust-LocalCA}
  }
  Write-Host 'Готово.' -ForegroundColor Green
 }catch{
  $failed=$true
  Write-Host ('ОШИБКА: '+$_.Exception.Message) -ForegroundColor Red
 }
 Write-Host 'Нажмите Enter, чтобы закрыть окно...'
 [void][Console]::ReadLine()
 if($failed){exit 1}else{exit 0}
}
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName Microsoft.VisualBasic
[System.Windows.Forms.Application]::EnableVisualStyles()
$form=New-Object System.Windows.Forms.Form
$form.Text='USD — офлайн-сервер ДЕМО'
$form.Size=New-Object System.Drawing.Size(620,403)
$form.StartPosition='CenterScreen'
$form.FormBorderStyle='FixedDialog'
$form.MaximizeBox=$false
$form.BackColor=[System.Drawing.Color]::FromArgb(246,247,249)
$heading=New-Object System.Windows.Forms.Label
$heading.Text='USD — ЛОКАЛЬНАЯ ПЛОЩАДКА'
$heading.Font=New-Object System.Drawing.Font('Segoe UI',15,[System.Drawing.FontStyle]::Bold)
$heading.SetBounds(25,20,560,36)
$form.Controls.Add($heading)
$desc=New-Object System.Windows.Forms.Label
$desc.Text='Только демонстрационные участники. Оффлайн-результаты не синхронизируются с основным сервером.'
$desc.SetBounds(26,62,560,42)
$desc.Font=New-Object System.Drawing.Font('Segoe UI',10)
$form.Controls.Add($desc)
function Add-Button($title,$y,$callback){
 $b=New-Object System.Windows.Forms.Button
 $b.Text=$title
 $b.SetBounds(26,$y,552,50)
 $b.Font=New-Object System.Drawing.Font('Segoe UI',11,[System.Drawing.FontStyle]::Bold)
 $b.Add_Click($callback)
 $form.Controls.Add($b)
}
function Launch-Action([string]$mode,[string]$ip=''){
 $args='-NoProfile -ExecutionPolicy Bypass -File "'+
  (Join-Path $script:Root 'one-click-windows.ps1')+'" -Mode '+$mode
 if($ip){$args+=' -LanIp '+$ip}
 Start-Process -FilePath powershell.exe -ArgumentList $args
}
Add-Button '1. Установить и запустить ДЕМО (один раз)' 108 {
 $ips=@(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object {$_.IPAddress -match '^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)'
    -and $_.AddressState -eq 'Preferred'} |
  Select-Object -ExpandProperty IPAddress)
 $ip=[Microsoft.VisualBasic.Interaction]::InputBox(
  'IPv4 ноутбука в Wi-Fi сети роутера: '+($ips -join ', '),
  'USD — локальная сеть',$(if($ips.Count -eq 1){$ips[0]}else{''}))
 if($ip){Launch-Action 'SetupDemo' $ip}
}
Add-Button '2. Запустить офлайн и открыть LIVE' 168 {Launch-Action 'Start'}
Add-Button '3. Вернуться на онлайн USD (БЕЗ синхронизации)' 228 {
 $answer=[System.Windows.Forms.MessageBox]::Show(
  'Остановить локальный сервер и открыть онлайн USD? Данные сохранятся на ноутбуке, но НЕ будут отправлены на основной сервер.',
  'USD — офлайн-данные не синхронизируются',
  [System.Windows.Forms.MessageBoxButtons]::YesNo,
  [System.Windows.Forms.MessageBoxIcon]::Warning)
 if($answer -eq [System.Windows.Forms.DialogResult]::Yes){Launch-Action 'Online'}
}
Add-Button 'Доверять локальному сертификату только на этом ноутбуке…' 288 {
 $answer=[System.Windows.Forms.MessageBox]::Show(
  'Корневой CA позволяет доверять HTTPS-сайтам, подписанным им. Продолжить отдельное подтверждение?',
  'USD — локальный сертификат',
  [System.Windows.Forms.MessageBoxButtons]::YesNo,
  [System.Windows.Forms.MessageBoxIcon]::Warning)
 if($answer -eq [System.Windows.Forms.DialogResult]::Yes){Launch-Action 'TrustCA'}
}
[void]$form.ShowDialog()
