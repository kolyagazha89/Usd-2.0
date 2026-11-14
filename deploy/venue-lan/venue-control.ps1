#requires -Version 5.1
<#
 USD venue Windows manager. Signed one-stage install, one-click offline/online.
 No production DB credentials are ever used. Docker Desktop must use Linux.
#>
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][ValidateSet('install','offline','online','export')][string]$Action,
 [switch]$Silent
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$Root=$PSScriptRoot
$PrivateDir=Join-Path $Root 'local-private'
$StateFile=Join-Path $PrivateDir 'setup-state.json'
$EnvFile=Join-Path $Root '.env'
$StartupFile=Join-Path ([Environment]::GetFolderPath('Startup')) 'USD-Venue-Autostart.lnk'
$OnlineUrl='https://app.usd-russia.ru'
$Phases=@('CONFIGURED','STORAGE_READY','SCHEMA_READY','IMPORTED','JOURNAL_READY','ADMIN_READY','STAFF_READY','READY')

function Get-RandomSecret([int]$Size=32){
 $buffer=New-Object byte[] $Size
 $rng=[System.Security.Cryptography.RandomNumberGenerator]::Create()
 try {$rng.GetBytes($buffer)} finally {$rng.Dispose()}
 return (-join ($buffer | ForEach-Object {$_.ToString('x2')}))
}
function Assert-Exit([string]$Purpose){
 if($LASTEXITCODE -ne 0){throw ('USD VENUE '+$Purpose+' failed with exit '+$LASTEXITCODE)}
}
function Invoke-Docker([string[]]$Arguments,[string]$Purpose){
 # Progress belongs to the host, never to a function's return value. Otherwise
 # `state=New-InitialState` and `mounts=Confirm-SignedStage` become mixed arrays.
 & docker @Arguments | Out-Host
 Assert-Exit $Purpose
}
function Invoke-Compose([string[]]$Arguments,[string]$Purpose){
 Invoke-Docker (@('compose','-p','usd-venue','-f',(Join-Path $Root 'compose.yaml'))+$Arguments) $Purpose
}
function Assert-VenueCompose {
 $compose=[IO.File]::ReadAllText((Join-Path $Root 'compose.yaml'))
 $expected='VENUE_STAGE_ID: '+[char]36+'{VENUE_STAGE_ID'
 if(-not $compose.Contains('name: usd-venue') -or
  -not $compose.Contains('USD_VENUE_LAN_MODE: "true"') -or
  -not $compose.Contains($expected)){
  throw 'Compose must be isolated and pinned to one offline stage'
 }
}
function Read-Env {
 if(-not(Test-Path -LiteralPath $EnvFile -PathType Leaf)){throw 'Нет локальной конфигурации. Запустите установку.'}
 $result=@{}
 foreach($line in [IO.File]::ReadAllLines($EnvFile)){
  $row=$line.Trim()
  if(!$row -or $row.StartsWith('#')){continue}
  $parts=$row.Split([char]'=',2)
  if($parts.Count -ne 2 -or $result.ContainsKey($parts[0])){throw 'Некорректный .env'}
  $result[$parts[0]]=$parts[1]
 }
 return $result
}
function Write-PrivateFile([string]$Path,[string]$Value){
 # Secure ACL BEFORE writing any secrets. Never overwrite existing files.
 $stream=New-Object System.IO.FileStream($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
 $stream.Dispose()
 $acl=New-Object System.Security.AccessControl.FileSecurity
 $acl.SetAccessRuleProtection($true,$false)
 $identity=[System.Security.Principal.WindowsIdentity]::GetCurrent().User
 $permission=New-Object System.Security.AccessControl.FileSystemAccessRule($identity,'FullControl','Allow')
 $acl.AddAccessRule($permission)
 [IO.File]::SetAccessControl($Path,$acl)
 [IO.File]::WriteAllText($Path,$Value,(New-Object System.Text.UTF8Encoding($false)))
}
function Read-State {
 if(!(Test-Path -LiteralPath $StateFile)){return $null}
 $s=Get-Content -LiteralPath $StateFile -Raw -Encoding UTF8|ConvertFrom-Json
 if(!$s -or $s.phase -notin $Phases -or
  $s.stageId -notmatch '^[0-9a-f-]{36}$' -or $s.fingerprint -notmatch '^[0-9a-f]{64}$'){
  throw 'Метаданные установки повреждены: не трогайте Docker volumes'
 }
 return $s
}
function Set-SetupPhase([object]$State,[string]$Phase){
 $old=[array]::IndexOf($Phases,[string]$State.phase)
 $next=[array]::IndexOf($Phases,$Phase)
 if($old -lt 0 -or $next -lt $old -or $next -gt $old+1){throw 'Опасный откат установки запрещён'}
 $State.phase=$Phase
 $temp=Join-Path $PrivateDir ('state-'+[guid]::NewGuid().ToString('N')+'.tmp')
 Write-PrivateFile $temp ($State|ConvertTo-Json -Depth 8)
 Move-Item -LiteralPath $temp -Destination $StateFile -Force
}
function Test-DockerReady {
 $prior=$ErrorActionPreference
 $ErrorActionPreference='Continue'
 try {
  & docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
  return ($LASTEXITCODE -eq 0)
 }catch{return $false}
 finally{$ErrorActionPreference=$prior}
}
function Ensure-DockerReady {
 if(-not(Get-Command docker -ErrorAction SilentlyContinue)){
  if($Action -eq 'install' -and (Get-Command winget -ErrorAction SilentlyContinue)){
   Write-Host 'Docker Desktop отсутствует. Нужно установить Linux containers с WSL2.'
   if(Confirm-VenueAction 'Для USD нужен Docker Desktop. Установить его сейчас? После установки откройте Docker Desktop, завершите настройку и снова нажмите установку USD.'){
    & winget install -e --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements
    Assert-Exit 'Docker Desktop install'
    throw 'Завершите настройку Docker Desktop и WSL2 (может понадобиться перезагрузка), затем нажмите кнопку ещё раз.'
   }
  }
  throw 'Нужен Docker Desktop: https://docs.docker.com/desktop/setup/install/windows-install/'
 }
 if(Test-DockerReady){return}
 $executable=Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
 if(Test-Path -LiteralPath $executable){Start-Process -FilePath $executable|Out-Null}
 for($i=0;$i -lt 60;$i++){
  Start-Sleep -Seconds 2
  if(Test-DockerReady){return}
 }
 throw 'Docker Desktop не готов. Проверьте WSL2, лицензию и режим Linux containers.'
}
function Get-PrivateLanIp {
 $addresses=@(Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
  $_.AddressState -eq 'Preferred' -and
  $_.InterfaceAlias -notmatch '(?i)vEthernet|WSL|Docker|Loopback' -and
  ($_.IPAddress -match '^192\.168\.' -or $_.IPAddress -match '^10\.' -or
   $_.IPAddress -match '^172\.(1[6-9]|2[0-9]|3[01])\.')
 })
 if($addresses.Count -eq 0){throw 'Подключите ноутбук к выделенному Wi-Fi-роутеру. Нужен частный IP-адрес.'}
 $options=@($addresses|ForEach-Object {[pscustomobject]@{Label=($_.InterfaceAlias+' — '+$_.IPAddress);Value=$_.IPAddress}})
 return Select-VenueOption 'USD — Сеть площадки' 'Выберите подключение к роутеру соревнований. Телефоны судей должны быть в этой же сети.' $options
}
function Ensure-Firewall([string]$Ip){
 $rule='USD Venue HTTPS '+$Ip
 if(Get-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue){return}
 $script=Join-Path $Root 'venue-firewall.ps1'
 $arguments='-NoProfile -ExecutionPolicy Bypass -File "'+$script+'" -Ip "'+$Ip+'"'
 Write-Host 'Нужно один раз подтвердить правило LAN HTTPS через UAC Windows.'
 $task=Start-Process powershell.exe -Verb RunAs -ArgumentList $arguments -Wait -PassThru
 if($task.ExitCode -ne 0 -or -not(Get-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue)){
  throw 'Разрешите защищённый доступ на частный IP через брандмауэр Windows.'
 }
}
function Save-Autostart {
 # A real Windows shortcut preserves non-ASCII paths in the repo/user profile.
 $script=Join-Path $Root 'venue-control.ps1'
 $shell=New-Object -ComObject WScript.Shell
 $shortcut=$shell.CreateShortcut($StartupFile)
 $shortcut.TargetPath=(Join-Path $PSHOME 'powershell.exe')
 $shortcut.Arguments='-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+$script+'" -Action offline -Silent'
 $shortcut.WorkingDirectory=$Root
 $shortcut.Description='USD: restart venue LAN server after Windows sign-in'
 $shortcut.Save()
}
function Remove-Autostart {
 if(Test-Path -LiteralPath $StartupFile){Remove-Item -LiteralPath $StartupFile -Force}
}
function Save-DesktopShortcuts {
 $desktop=[Environment]::GetFolderPath('Desktop')
 $shell=New-Object -ComObject WScript.Shell
 foreach($item in @(@('USD — Офлайн','offline'),@('USD — Онлайн','online'),@('USD — Экспорт','export'))){
  $shortcut=$shell.CreateShortcut((Join-Path $desktop ($item[0]+'.lnk')))
  $shortcut.TargetPath=(Join-Path $PSHOME 'powershell.exe')
  $shortcut.Arguments='-NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $Root 'venue-control.ps1')+'" -Action '+$item[1]
  $shortcut.WorkingDirectory=$Root;$shortcut.Save()
 }
 $help=$shell.CreateShortcut((Join-Path $desktop 'USD — Инструкция.lnk'))
 $help.TargetPath=(Join-Path $Root 'INSTRUCTION.html');$help.Save()
}
function Assert-VenueReleaseImages([string]$Sha){
 # The public /release may still report an old Ubuntu image even when the
 # Windows ZIP carries newer LAN-only scripts. Refuse mixed versions.
 if($Sha -cnotmatch '^[a-f0-9]{40}
 if(Test-Path -LiteralPath $EnvFile){throw '.env существует без маркера установки. Нельзя затирать чужую конфигурацию.'}
 $ip=Get-PrivateLanIp
 Write-Host '1 = ДЕМО на вымышленных участниках, 2 = реальный подписанный экспорт USD.'
 $kind=Select-VenueOption 'USD — Первый запуск' 'Для знакомства выберите ДЕМО. Настоящий этап запускайте после проверки ноутбука и телефонов без интернета.' @(
  [pscustomobject]@{Label='ДЕМО — пробный запуск без настоящих участников';Value='1'},
  [pscustomobject]@{Label='Подписанный этап — предварительная подготовка';Value='2'}
 )
 if($kind -notin @('1','2')){throw 'Выбор отменён'}
 $release=Invoke-RestMethod -Uri 'https://api.usd-russia.ru/release' -TimeoutSec 20
 $sha=[string]$release.revision
 if($sha -cnotmatch '^[a-f0-9]{40}$'){throw 'Нет проверенного SHA онлайн-релиза'}
 Invoke-Docker @('pull',('ghcr.io/kolyagazha89/usd-2.0-api:'+$sha)) 'API image pull'
 Invoke-Docker @('pull',('ghcr.io/kolyagazha89/usd-2.0-frontend:'+$sha)) 'frontend image pull'
 Assert-VenueReleaseImages $sha
 $file='';$key='';$stageId='';$fingerprint=''
 if($kind -eq '1'){
  $packetParent=Join-Path $PrivateDir 'demo-packages'
  New-Item -ItemType Directory -Path $packetParent -Force|Out-Null
  $folder='demo-'+[guid]::NewGuid().ToString('N')
  Invoke-Docker @('run','--rm','--network','none',
   '--volume',($Root+':/venue-source:ro'),
   '--volume',($packetParent+':/venue-private:rw'),
   '--entrypoint','node',('ghcr.io/kolyagazha89/usd-2.0-api:'+$sha),
   '/venue-source/make-demo-stage.mjs',('/venue-private/'+$folder)) 'DEMO stage generation'
  $output=Join-Path $packetParent $folder
  $file=Join-Path $output 'usd-venue-demo-stage.json'
  $key=Join-Path $output 'signing-public.pem'
  $lines=Get-Content -LiteralPath (Join-Path $output 'demo-info.txt') -Encoding UTF8
  $stageId=($lines|Where-Object {$_ -match '^VENUE_STAGE_ID='}|Select-Object -First 1).Split('=',2)[1]
  $fingerprint=($lines|Where-Object {$_ -match '^VENUE_SIGNING_KEY_FINGERPRINT='}|Select-Object -First 1).Split('=',2)[1]
  Write-Host 'ДЕМО: не вводите настоящие ФИО и госномера; возврат в Ubuntu запрещён.'
 }else{
  $file=Select-VenueFile 'Выберите файл этапа, скачанный из админки USD' 'Файл этапа (*.json)|*.json'
  $key=Select-VenueFile 'Выберите открытый ключ из админки USD' 'Открытый ключ (*.pem)|*.pem'
  $payload=Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json
  $stageId=[string]$payload.snapshot.stageId
  # Trusted fingerprint comes independently from the authenticated admin page.
  $fingerprint=(Read-VenueFingerprint).Trim()
  if($fingerprint -cnotmatch '^[a-f0-9]{64}$'){throw 'Нет независимого доверенного отпечатка Ed25519'}
  if([string]$payload.snapshot.syncAuthorization.token -cnotmatch '^[A-Za-z0-9_-]{43}$'){
   throw 'Скачайте новый подписанный пакет этапа для автоматической синхронизации'
  }
  if([string]$payload.snapshot.staffAccess.algorithm -cne 'AES-256-GCM'){
   throw 'Скачайте новый пакет этапа с существующими аккаунтами судей'
  }
  $keyFile=Select-VenueFile 'Выберите отдельный ключ входа судей из админки USD' 'Ключ доступа (*.key)|*.key'
  $keyValue=[IO.File]::ReadAllText($keyFile).Trim()
  if($keyValue -cnotmatch '^[A-Za-z0-9_-]{43}$'){throw 'Неверный файл ключа судей'}
  $privateAccess=Join-Path $PrivateDir 'venue-staff-access.key'
  Write-PrivateFile $privateAccess $keyValue
  $fileKey=$privateAccess
  $privateStage=Join-Path $PrivateDir 'signed-real-stage.json'
  Write-PrivateFile $privateStage ([IO.File]::ReadAllText($file))
  $file=$privateStage
 }
 if($stageId -notmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'){
  throw 'Неверный UUID этапа'
 }
 $dbRoot=Get-RandomSecret 32
 $dbPassword=Get-RandomSecret 32
 $values=[ordered]@{
  VENUE_BIND_IP=$ip;VENUE_IMAGE_TAG=$sha;VENUE_STAGE_ID=$stageId
  VENUE_SIGNING_KEY_FINGERPRINT=$fingerprint
  VENUE_DB_NAME='usd_venue';VENUE_DB_ROOT_USER='usd_venue_root'
  VENUE_DB_ROOT_PASSWORD=$dbRoot;VENUE_DB_USER='usd_venue'
  VENUE_DB_PASSWORD=$dbPassword
  VENUE_DATABASE_URL=('postgresql://usd_venue:'+$dbPassword+'@db:5432/usd_venue?schema=public')
  VENUE_JWT_SECRET=(Get-RandomSecret 32)
  VENUE_S3_ROOT_ACCESS=('usdroot'+(Get-RandomSecret 8))
  VENUE_S3_ROOT_SECRET=(Get-RandomSecret 32)
  VENUE_S3_APP_ACCESS=('usdapp'+(Get-RandomSecret 8))
  VENUE_S3_APP_SECRET=(Get-RandomSecret 32)
 }
 $text=($values.GetEnumerator()|ForEach-Object {$_.Key+'='+$_.Value}) -join [Environment]::NewLine
 Write-PrivateFile $EnvFile ($text+[Environment]::NewLine)
 $state=[pscustomobject]@{
  format=1;phase='CONFIGURED';stageId=$stageId;fingerprint=$fingerprint
  ip=$ip;image=$sha;package=$file;publicKey=$key;demo=($kind -eq '1')
  accessKey=$(if($kind -eq '2'){$fileKey}else{$null})
 }
 Set-SetupPhase $state 'CONFIGURED'
 return $state
}
function Confirm-SignedStage([object]$State) {
 $config=Read-Env
 if($config['VENUE_STAGE_ID'] -ne $State.stageId -or
  $config['VENUE_SIGNING_KEY_FINGERPRINT'] -ne $State.fingerprint -or
  $config['VENUE_BIND_IP'] -ne $State.ip){throw 'Подменён этап или доверенный ключ'}
 if(!(Test-Path -LiteralPath $State.package) -or !(Test-Path -LiteralPath $State.publicKey)){
  throw 'Пакет этапа или доверенный открытый ключ больше не доступны'
 }
 $mounts=@('--volume',($State.package+':/app/venue-stage.json:ro'),
  '--volume',($State.publicKey+':/app/venue-signing-public.pem:ro'),
  '--volume',((Join-Path $Root 'verify-stage-package.mjs')+':/app/verify-stage-package.mjs:ro'))
 Invoke-Compose (@('run','--rm','--no-deps')+$mounts+
  @('--entrypoint','node','api','/app/verify-stage-package.mjs',
  '/app/venue-stage.json','/app/venue-signing-public.pem')) 'verify stage signature'
 return $mounts
}
function Ask-StrongPassword([string]$Name){
 return Read-VenuePassword $Name
}
function Create-Staff([string]$Kind,[string]$Login){
 $password=Ask-StrongPassword $Login
 try{
  $mounts=@('--volume',((Join-Path $Root 'import-stage.mjs')+':/app/import-stage.mjs:ro'),
   '--volume',((Join-Path $Root 'verify-stage-package.mjs')+':/app/verify-stage-package.mjs:ro'),
   '--volume',((Join-Path $Root 'provision-staff.mjs')+':/app/provision-staff.mjs:ro'))
  # The secret is passed only via stdin, never through command arguments.
  $password | & docker compose -p usd-venue -f (Join-Path $Root 'compose.yaml') run --rm --no-deps -T @mounts --entrypoint node api /app/provision-staff.mjs $Kind $Login
  Assert-Exit ('staff '+$Login)
 }finally{$password=$null}
}
function Create-ExistingStaff([object]$State,[array]$Mounts){
 if($State.demo -or [string]::IsNullOrWhiteSpace([string]$State.accessKey) -or
  !(Test-Path -LiteralPath $State.accessKey -PathType Leaf)){
  throw 'Для настоящего этапа требуется отдельный ключ существующих аккаунтов USD'
 }
 $staffMounts=@('--volume',($State.accessKey+':/app/venue-access-key.txt:ro'),
  '--volume',((Join-Path $Root 'import-stage.mjs')+':/app/import-stage.mjs:ro'),
  '--volume',((Join-Path $Root 'provision-staff.mjs')+':/app/provision-staff.mjs:ro'),
  '--volume',((Join-Path $Root 'provision-existing-staff.mjs')+':/app/provision-existing-staff.mjs:ro'))
 Invoke-Compose (@('run','--rm','--no-deps')+$Mounts+$staffMounts+
  @('--entrypoint','node','api','/app/provision-existing-staff.mjs',
  '/app/venue-stage.json','/app/venue-signing-public.pem','/app/venue-access-key.txt')) 'restore centrally approved staff logins'
}
function Install-Local {
 Assert-VenueCompose
 Ensure-DockerReady
 if(!(Test-Path -LiteralPath $PrivateDir)){
  New-Item -ItemType Directory -Path $PrivateDir|Out-Null
 }
 $state=Read-State
 if(!$state){$state=New-InitialState}
 $cfg=Read-Env
 if($cfg['VENUE_STAGE_ID'] -ne $state.stageId -or $cfg['VENUE_IMAGE_TAG'] -ne $state.image){
  throw 'Конфигурация этапа не совпадает с установкой'
 }
 Ensure-Firewall $state.ip
 Invoke-Compose @('config','--quiet') 'Docker Compose validation'
 if($state.phase -eq 'READY'){Start-Local;return}
 $mounts=Confirm-SignedStage $state
 if($state.phase -eq 'CONFIGURED'){
  Invoke-Compose @('pull') 'download images'
  Invoke-Compose @('up','-d','db','rustfs') 'start storage'
  $env:VENUE_S3_ROOT_ACCESS=$cfg['VENUE_S3_ROOT_ACCESS']
  $env:VENUE_S3_ROOT_SECRET=$cfg['VENUE_S3_ROOT_SECRET']
  try{
   Invoke-Compose @('run','--rm','--no-deps',
    '-e','VENUE_S3_ROOT_ACCESS','-e','VENUE_S3_ROOT_SECRET',
    '--volume',((Join-Path $Root 'provision-rustfs.mjs')+':/app/provision-rustfs.mjs:ro'),
    '--entrypoint','node','api','/app/provision-rustfs.mjs') 'setup RustFS IAM'
  }finally{
   Remove-Item Env:\VENUE_S3_ROOT_ACCESS -ErrorAction SilentlyContinue
   Remove-Item Env:\VENUE_S3_ROOT_SECRET -ErrorAction SilentlyContinue
  }
  Set-SetupPhase $state 'STORAGE_READY'
 }
 if($state.phase -eq 'STORAGE_READY'){
  Invoke-Compose @('up','-d','db','rustfs') 'start DB'
  Invoke-Compose @('run','--rm','--no-deps','--entrypoint',
   './node_modules/.bin/prisma','api','migrate','deploy',
   '--config','./prisma7.config.ts') 'migrate isolated DB'
  Set-SetupPhase $state 'SCHEMA_READY'
 }
 if($state.phase -eq 'SCHEMA_READY'){
  if(-not(Confirm-VenueAction ('Загрузить выбранный этап в отдельную локальную базу?'+[Environment]::NewLine+'Этап: '+$state.stageId+[Environment]::NewLine+'Основной сервер не изменяется.'))){throw 'Импорт отменён'}
  Invoke-Compose (@('run','--rm','--no-deps')+$mounts+
   @('--volume',((Join-Path $Root 'import-stage.mjs')+':/app/import-stage.mjs:ro'),
    '--entrypoint','node','api','/app/import-stage.mjs',
    '/app/venue-stage.json','/app/venue-signing-public.pem','--apply',$state.stageId)) 'signed stage import'
  Set-SetupPhase $state 'IMPORTED'
 }
 if($state.phase -eq 'IMPORTED'){
  Get-Content -LiteralPath (Join-Path $Root 'install-journal.sql') -Raw -Encoding UTF8 |
   & docker compose -p usd-venue -f (Join-Path $Root 'compose.yaml') exec -T db psql -v 'ON_ERROR_STOP=1' -U usd_venue_root -d usd_venue
  Assert-Exit 'append-only journal'
  Set-SetupPhase $state 'JOURNAL_READY'
 }
 if($state.phase -eq 'JOURNAL_READY'){
  if($state.demo){Create-Staff 'admin' 'operator1'}
  else{Create-ExistingStaff $state $mounts}
  Set-SetupPhase $state 'ADMIN_READY'
 }
 if($state.phase -eq 'ADMIN_READY'){
  if($state.demo){Create-Staff 'judge' 'judge-01'}
  Set-SetupPhase $state 'STAFF_READY'
 }
 if($state.phase -eq 'STAFF_READY'){
  Invoke-Compose @('up','-d') 'start HTTPS API and LIVE'
  Set-SetupPhase $state 'READY'
 }
 Start-Local
}
function Export-VenueCA {
 $destination=Join-Path $PrivateDir 'USD-Venue-CA.crt'
 if(Test-Path -LiteralPath $destination){return}
 try{
  $container=(& docker compose -p usd-venue -f (Join-Path $Root 'compose.yaml') ps -q gateway | Select-Object -First 1)
  if($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($container) -or
   $container -notmatch '^[a-f0-9]{12,64}$'){return}
  & docker cp ($container+':/data/caddy/pki/authorities/local/root.crt') $destination 2>$null | Out-Null
  if($LASTEXITCODE -ne 0){throw 'Caddy CA not ready'}
 }catch{
  if(Test-Path -LiteralPath $destination){Remove-Item -LiteralPath $destination -Force}
  if(-not $Silent){Write-Host 'Сертификат Caddy ещё не готов — повторите запуск позже.'}
 }
}
function Start-Local {
 Assert-VenueCompose
 $state=Read-State
 if(!$state -or $state.phase -ne 'READY'){throw 'Сначала завершите установку USD-Install.cmd'}
 $cfg=Read-Env
 if($cfg['VENUE_STAGE_ID'] -ne $state.stageId -or
  $cfg['VENUE_SIGNING_KEY_FINGERPRINT'] -ne $state.fingerprint -or
  $cfg['VENUE_BIND_IP'] -ne $state.ip){throw 'Закреплённый этап или IP изменён'}
 Ensure-DockerReady
 # Existing installations may have an older 18-trigger journal. Bring the
 # root-owned link trigger up to date WITHOUT clearing historic journal rows.
 # The coverage watermark prevents treating earlier untracked links as complete.
 Invoke-Compose @('up','-d','--wait','--no-build','--pull','never','db') 'start local DB for journal coverage check'
 Get-Content -LiteralPath (Join-Path $Root 'upgrade-journal-links.sql') -Raw -Encoding UTF8 |
  & docker compose -p usd-venue -f (Join-Path $Root 'compose.yaml') exec -T db psql -v 'ON_ERROR_STOP=1' -U usd_venue_root -d usd_venue
 Assert-Exit 'upgrade durable amplifier link journal'
 Invoke-Compose @('up','-d','--no-build','--pull','never') 'start offline without Internet'
 # Wait for a responding local API before opening the browser or exporting CA.
 $ready=$false
 for($i=0;$i -lt 40;$i++){
  if(Test-VenueApiReady){$ready=$true;break}
  Start-Sleep -Seconds 2
 }
 if(-not $ready){throw 'Сервер ещё не ответил. Подождите немного и нажмите «USD — Офлайн» снова. Данные сохранены.'}
 Save-Autostart
 Save-DesktopShortcuts
 Export-VenueCA
 if(-not $Silent){
  $url='https://'+$state.ip+'/login'
  Write-Host ('ОФЛАЙН USD: '+$url)
  Write-Host ('LIVE: https://'+$state.ip+'/venue/live')
  Write-Host 'Телефонам необходимо отдельно доверить локальный CA Caddy.'
  Start-Process $url
  Show-VenueMessage ('USD запущен.'+[Environment]::NewLine+'Вход: '+$url+[Environment]::NewLine+'Табло: https://'+$state.ip+'/venue/live'+[Environment]::NewLine+'Подключите телефоны к тому же Wi-Fi. Порядок установки сертификата — в инструкции на рабочем столе.')
 }
}
function Test-VenueApiReady {
 $prior=$ErrorActionPreference;$ErrorActionPreference='Continue'
 try{
  & docker compose -p usd-venue -f (Join-Path $Root 'compose.yaml') exec -T api node -e "fetch('http://127.0.0.1:3000/release').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>$null | Out-Null
  return ($LASTEXITCODE -eq 0)
 }catch{return $false}
 finally{$ErrorActionPreference=$prior}
}
function Export-VenueReturn {
 param([switch]$LeaveApiStopped,[switch]$Automatic)
 # This makes a signed ENCRYPTED USB file. It cannot synchronize with Ubuntu.
 # Never run in DEMO, use a central secret, or delete local durable records.
 if($Silent){throw 'Экспорт требует присутствия администратора и пароль'}
 Assert-VenueCompose
 $state=Read-State
 if(!$state -or $state.phase -ne 'READY'){throw 'Сначала завершите установку сервера USD'}
 if($state.demo){throw 'ДЕМО не может отправляться на основной сервер'}
 $cfg=Read-Env
 if($cfg['VENUE_STAGE_ID'] -ne $state.stageId -or
  $cfg['VENUE_IMAGE_TAG'] -ne $state.image -or
  $cfg['VENUE_SIGNING_KEY_FINGERPRINT'] -ne $state.fingerprint){
  throw 'Идентификатор этапа или его исходная подпись изменились'
 }
 Ensure-DockerReady
 $directory=Join-Path $PrivateDir 'return-output'
 New-Item -ItemType Directory -Path $directory -Force|Out-Null
 $volume='usd-venue_venue_return_keys'
 $keyTool=Join-Path $Root 'ensure-return-keys.mjs'
 $keyMounts=@('--volume',($volume+':/app/venue-return-keys:rw'),
  '--volume',($directory+':/app/venue-return-output:rw'),
  '--volume',($keyTool+':/app/ensure-return-keys.mjs:ro'))
 # Root is used only by an isolated, networkless one-shot key provisioner;
 # it hands the key volume to the regular non-root (node:1000) API image user.
 Invoke-Docker (@('run','--rm','--network','none','--user','root')+
  $keyMounts+@('--entrypoint','node',
  ('ghcr.io/kolyagazha89/usd-2.0-api:'+$state.image),
  '/app/ensure-return-keys.mjs','/app/venue-return-keys',
  '/app/venue-return-output')) 'create protected signing key'
 $publicKey=Join-Path $directory 'USD-Venue-Return-Public.pem'
 $fingerprintFile=Join-Path $directory 'USD-Venue-Return-Fingerprint.txt'
 if(!(Test-Path -LiteralPath $publicKey -PathType Leaf) -or
  !(Test-Path -LiteralPath $fingerprintFile -PathType Leaf)){
  throw 'Не удалось подготовить открытый ключ возвратного пакета'
 }
 $fingerprint=(Get-Content -LiteralPath $fingerprintFile -Raw -Encoding UTF8).Trim()
 if($fingerprint -cnotmatch '^[a-f0-9]{64}$'){throw 'Некорректный отпечаток ключа'}
 Invoke-Compose @('up','-d','--wait','db') 'start isolated DB for safe export'
 $date=[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')
 $filename=('usd-venue-return-'+$state.stageId+'-'+$date+'-'+[guid]::NewGuid().ToString('N').Substring(0,8)+'.json')
 $secret=$null
 if($Automatic){
  if(!(Test-Path -LiteralPath $state.package -PathType Leaf)){throw 'Нет исходного подписанного этапа'}
  $originalStage=Get-Content -LiteralPath $state.package -Raw -Encoding UTF8|ConvertFrom-Json
  $syncToken=[string]$originalStage.snapshot.syncAuthorization.token
  if($originalStage.snapshot.stageId -ne $state.stageId -or
   $syncToken -cnotmatch '^[A-Za-z0-9_-]{43}$' -or
   ([DateTime]$originalStage.snapshot.syncAuthorization.expiresAt).ToUniversalTime() -le [DateTime]::UtcNow){
   throw 'Пакет не разрешает автоматическую синхронизацию. Загрузите новый подписанный этап.'
  }
  $secret='UsdSync!1-'+$syncToken
 }else{$secret=Read-VenuePassword 'шифрования возвратного файла'}
 # A direct Export click is as important as the Online button: do NOT export
 # while a judge can still enter a result. Detect the prior API state so
 # export from a stopped server never starts it unexpectedly.
 $apiRunning=@(& docker compose -p usd-venue -f (Join-Path $Root 'compose.yaml') ps --status running -q api)
 Assert-Exit 'inspect currently running judge API'
 $apiWasRunning=@($apiRunning|Where-Object { -not [string]::IsNullOrWhiteSpace($_) }).Count -gt 0
 $apiStopped=$false
 $exportSucceeded=$false
 $returnFile=Join-Path $directory $filename
 try{
  if($apiWasRunning){
   Invoke-Compose @('stop','api') 'pause judging before consistent signed return export'
   $apiStopped=$true
  }
  $args=@('compose','-p','usd-venue','-f',(Join-Path $Root 'compose.yaml'),
   'run','--rm','--no-deps','-T',
   '--volume',($volume+':/app/venue-return-keys:ro'),
   '--volume',($directory+':/app/venue-return-output:rw'),
   '--volume',((Join-Path $Root 'import-stage.mjs')+':/app/import-stage.mjs:ro'),
   '--volume',((Join-Path $Root 'verify-stage-package.mjs')+':/app/verify-stage-package.mjs:ro'),
   '--volume',((Join-Path $Root 'venue-return-package.mjs')+':/app/venue-return-package.mjs:ro'),
   '--volume',((Join-Path $Root 'export-venue-return.mjs')+':/app/export-venue-return.mjs:ro'),
   '--entrypoint','node','api','/app/export-venue-return.mjs',
   '/app/venue-return-keys/venue-return-private.pem',
   ('/app/venue-return-output/'+$filename))
  # Password is sent over stdin ONLY, never exposed in arguments or logs.
  $output=@($secret | & docker @args)
  Assert-Exit 'signed encrypted USB return export'
  foreach($line in $output){Write-Host $line}
  $summaryLine=$output|Where-Object {$_ -match '^\{.*\}$'}|Select-Object -Last 1
  if(!$summaryLine){throw 'Экспорт не вернул контрольную сумму журнала'}
  $summary=$summaryLine|ConvertFrom-Json
  if([string]$summary.stageId -ne $state.stageId -or
   [string]$summary.journalEndHash -cnotmatch '^[a-f0-9]{64}$'){
   throw 'Неверный контрольный хеш экспортированного журнала'
  }
  if(!(Test-Path -LiteralPath $returnFile -PathType Leaf) -or
   (Get-Item -LiteralPath $returnFile).Length -lt 1){
   throw 'Экспорт не создан — журнал сохранён'
  }
  $exportSucceeded=$true
 }finally{
  $secret=$null
  # A standalone export must restore the judge API, whereas the Online
  # button intentionally leaves it frozen until the remaining stack stops.
  # Any failed export restores the previously running API in both modes.
  if($apiStopped -and ((-not $LeaveApiStopped) -or (-not $exportSucceeded))){
   Invoke-Compose @('up','-d','--no-build','--pull','never','api') 'restore judging after return export'
  }
 }
 if($Automatic){
  return [pscustomobject]@{
   path=$returnFile;publicKey=$publicKey;stageId=$state.stageId
   journalEndHash=[string]$summary.journalEndHash
  }
 }
 Write-Host ('ЗАШИФРОВАННЫЙ ФАЙЛ: '+$returnFile)
 Write-Host ('ОТКРЫТЫЙ КЛЮЧ: '+$publicKey)
 Write-Host ('ОТПЕЧАТОК КЛЮЧА: '+$fingerprint)
 Write-Host 'ЭТО НЕ СИНХРОНИЗАЦИЯ. Данные останутся на ноутбуке до подтверждения Ubuntu.'
 Show-VenueMessage ('Возвратный файл создан.'+[Environment]::NewLine+
  'Папка: '+$directory+[Environment]::NewLine+
  'Передайте шифрованный файл ответственному администратору USD.'+[Environment]::NewLine+
  'Открытый ключ и его отпечаток сверяются отдельно.'+[Environment]::NewLine+
  'Пароль сообщайте отдельно. Синхронизация НЕ завершена.'+[Environment]::NewLine+
  'НЕ УДАЛЯЙТЕ ДАННЫЕ НОУТБУКА.')
}
function Sync-VenueReturn([object]$Bundle){
 $state=Read-State
 if(!$state -or $state.demo -or $state.stageId -ne $Bundle.stageId){throw 'Неверный этап для центральной синхронизации'}
 $signed=Get-Content -LiteralPath $state.package -Raw -Encoding UTF8|ConvertFrom-Json
 $token=[string]$signed.snapshot.syncAuthorization.token
 if($token -cnotmatch '^[A-Za-z0-9_-]{43}$' -or
  ([DateTime]$signed.snapshot.syncAuthorization.expiresAt).ToUniversalTime() -le [DateTime]::UtcNow){
  throw 'Право автоматического возврата истекло. Данные ноутбука не удалены.'
 }
 $encrypted=[IO.File]::ReadAllText($Bundle.path).Trim()
 $pem=[IO.File]::ReadAllText($Bundle.publicKey)
 # Preserve the exact authenticated AES-GCM envelope JSON: ConvertTo-Json
 # of a large nested object can truncate it on Windows PowerShell 5.1.
 $body='{"stageId":'+(ConvertTo-Json -InputObject $Bundle.stageId -Compress)+
  ',"publicKeyPem":'+(ConvertTo-Json -InputObject $pem -Compress)+
  ',"envelope":'+$encrypted+'}'
 $SyncResult=Invoke-RestMethod -Uri 'https://api.usd-russia.ru/stages/venue/sync' -Method POST -Headers @{Authorization=('Venue '+$token)} -Body ([Text.Encoding]::UTF8.GetBytes($body)) -ContentType 'application/json; charset=utf-8' -TimeoutSec 180
 if($SyncResult.accepted -ne $true -or
  $SyncResult.databaseSynchronized -ne $true -or
  $SyncResult.derivedRankingsRebuilt -ne $true -or
  [string]$SyncResult.stageId -ne $Bundle.stageId -or
  [string]$SyncResult.journalEndHash -ne $Bundle.journalEndHash){
  throw 'Центральная Ubuntu не подтвердила все записи и пересчёт. Попробуйте ещё раз.'
 }
 $ack=Join-Path $PrivateDir ('sync-ack-'+$Bundle.journalEndHash+'.json')
 if(!(Test-Path -LiteralPath $ack)){
  Write-PrivateFile $ack ((@{accepted=$true;stageId=$Bundle.stageId;journalEndHash=$Bundle.journalEndHash;at=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json -Compress)+[Environment]::NewLine)
 }
 return $SyncResult
}
function Restore-VenueApi {
 Invoke-Compose @('up','-d','--no-build','--pull','never','api') 'restore local judging after failed sync'
}
function Return-Online {
 $state=Read-State
 if($state -and $state.phase -eq 'READY' -and (-not $state.demo)){
  if($Silent){throw 'Синхронизация реального этапа требует нажатия администратора'}
  $frozen=$false
  try{
   $bundle=Export-VenueReturn -LeaveApiStopped -Automatic
   $frozen=$true
   $SyncResult=Sync-VenueReturn -Bundle $bundle
   if($SyncResult.accepted -ne $true){throw 'Нет подтверждения ACKNOWLEDGED центрального сервера'}
  }catch{
   if($frozen){try{Restore-VenueApi}catch{Write-Host 'Локальная база сохранена. Откройте USD — Офлайн.'}}
   throw
  }
 }
 Remove-Autostart
 if(Get-Command docker -ErrorAction SilentlyContinue){
  if((Test-DockerReady) -and (Test-Path -LiteralPath $EnvFile)){
   Invoke-Compose @('stop') 'stop after central ACK without deleting local DB'
  }
 }
 Write-Host 'USD ONLINE. Synchronization ACKNOWLEDGED. Local backup preserved.'
 if(-not $Silent){Start-Process $OnlineUrl}
}
if($MyInvocation.InvocationName -eq '.'){return}
try{
 if(-not $Silent){. (Join-Path $Root 'venue-dialogs.ps1')}
 if($Action -eq 'install'){Install-Local}
 elseif($Action -eq 'offline'){Start-Local}
 elseif($Action -eq 'export'){Export-VenueReturn}
 else{Return-Online}
}catch{
 Write-Host ('USD VENUE: не удалось безопасно выполнить действие '+$Action) -ForegroundColor Red
 if(!$Silent){Write-Host ('Причина: '+$_.Exception.Message)}
 if(!$Silent -and (Get-Command Show-VenueMessage -ErrorAction SilentlyContinue)){
  Show-VenueMessage ('Действие не завершено.'+[Environment]::NewLine+$_.Exception.Message+[Environment]::NewLine+'Ничего не удаляйте. Устраните причину и нажмите ту же кнопку снова.')
 }
 Write-Host 'Ничего не удаляйте. После устранения причины повторите тот же запуск.'
 exit 1
}
){throw 'Неверная версия USD'}
 foreach($name in @('api','frontend')){
  $ref='ghcr.io/kolyagazha89/usd-2.0-'+$name+':'+$Sha
  $revision=(& docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' $ref 2>$null)
  if($LASTEXITCODE -ne 0 -or [string]$revision -cne $Sha){
   throw 'Образы USD ещё не совпадают с подтверждённой версией сервера. Завершите обновление Ubuntu и повторите установку.'
  }
 }
 $apiImage='ghcr.io/kolyagazha89/usd-2.0-api:'+$Sha
 # Check the actual offline modules in the already-downloaded API image,
 # without Internet access, production credentials, or database changes.
 $program=@'
const fs=require("node:fs");
const sha=process.argv[1];
const files=[
 "/app/dist/auth/venue-route-policy.js",
 "/app/dist/stages/venue-staff-access.js",
 "/app/dist/stages/venue-stage.service.js",
 "/app/dist/results/results.service.js",
 "/app/usd-release.json"
];
if(files.some(file=>!fs.existsSync(file)))process.exit(4);
const release=JSON.parse(fs.readFileSync("/app/usd-release.json","utf8"));
if(release.revision!==sha)process.exit(5);
console.log("USD VENUE API RELEASE CHECK PASSED");
'@
 & docker run --rm --network none --entrypoint node $apiImage -e $program $Sha | Out-Host
 if($LASTEXITCODE -ne 0){
  throw 'На Ubuntu установлена старая версия USD без полного офлайн-режима. Ничего не установлено; дождитесь подтверждённого обновления и повторите.'
 }
}
function New-InitialState {
 if(Test-Path -LiteralPath $EnvFile){throw '.env существует без маркера установки. Нельзя затирать чужую конфигурацию.'}
 $ip=Get-PrivateLanIp
 Write-Host '1 = ДЕМО на вымышленных участниках, 2 = реальный подписанный экспорт USD.'
 $kind=Select-VenueOption 'USD — Первый запуск' 'Для знакомства выберите ДЕМО. Настоящий этап запускайте после проверки ноутбука и телефонов без интернета.' @(
  [pscustomobject]@{Label='ДЕМО — пробный запуск без настоящих участников';Value='1'},
  [pscustomobject]@{Label='Подписанный этап — предварительная подготовка';Value='2'}
 )
 if($kind -notin @('1','2')){throw 'Выбор отменён'}
 $release=Invoke-RestMethod -Uri 'https://api.usd-russia.ru/release' -TimeoutSec 20
 $sha=[string]$release.revision
 if($sha -cnotmatch '^[a-f0-9]{40}$'){throw 'Нет проверенного SHA онлайн-релиза'}
 Invoke-Docker @('pull',('ghcr.io/kolyagazha89/usd-2.0-api:'+$sha)) 'API image pull'
 $file='';$key='';$stageId='';$fingerprint=''
 if($kind -eq '1'){
  $packetParent=Join-Path $PrivateDir 'demo-packages'
  New-Item -ItemType Directory -Path $packetParent -Force|Out-Null
  $folder='demo-'+[guid]::NewGuid().ToString('N')
  Invoke-Docker @('run','--rm','--network','none',
   '--volume',($Root+':/venue-source:ro'),
   '--volume',($packetParent+':/venue-private:rw'),
   '--entrypoint','node',('ghcr.io/kolyagazha89/usd-2.0-api:'+$sha),
   '/venue-source/make-demo-stage.mjs',('/venue-private/'+$folder)) 'DEMO stage generation'
  $output=Join-Path $packetParent $folder
  $file=Join-Path $output 'usd-venue-demo-stage.json'
  $key=Join-Path $output 'signing-public.pem'
  $lines=Get-Content -LiteralPath (Join-Path $output 'demo-info.txt') -Encoding UTF8
  $stageId=($lines|Where-Object {$_ -match '^VENUE_STAGE_ID='}|Select-Object -First 1).Split('=',2)[1]
  $fingerprint=($lines|Where-Object {$_ -match '^VENUE_SIGNING_KEY_FINGERPRINT='}|Select-Object -First 1).Split('=',2)[1]
  Write-Host 'ДЕМО: не вводите настоящие ФИО и госномера; возврат в Ubuntu запрещён.'
 }else{
  $file=Select-VenueFile 'Выберите файл этапа, скачанный из админки USD' 'Файл этапа (*.json)|*.json'
  $key=Select-VenueFile 'Выберите открытый ключ из админки USD' 'Открытый ключ (*.pem)|*.pem'
  $payload=Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json
  $stageId=[string]$payload.snapshot.stageId
  # Trusted fingerprint comes independently from the authenticated admin page.
  $fingerprint=(Read-VenueFingerprint).Trim()
  if($fingerprint -cnotmatch '^[a-f0-9]{64}$'){throw 'Нет независимого доверенного отпечатка Ed25519'}
  if([string]$payload.snapshot.syncAuthorization.token -cnotmatch '^[A-Za-z0-9_-]{43}$'){
   throw 'Скачайте новый подписанный пакет этапа для автоматической синхронизации'
  }
  if([string]$payload.snapshot.staffAccess.algorithm -cne 'AES-256-GCM'){
   throw 'Скачайте новый пакет этапа с существующими аккаунтами судей'
  }
  $keyFile=Select-VenueFile 'Выберите отдельный ключ входа судей из админки USD' 'Ключ доступа (*.key)|*.key'
  $keyValue=[IO.File]::ReadAllText($keyFile).Trim()
  if($keyValue -cnotmatch '^[A-Za-z0-9_-]{43}$'){throw 'Неверный файл ключа судей'}
  $privateAccess=Join-Path $PrivateDir 'venue-staff-access.key'
  Write-PrivateFile $privateAccess $keyValue
  $fileKey=$privateAccess
  $privateStage=Join-Path $PrivateDir 'signed-real-stage.json'
  Write-PrivateFile $privateStage ([IO.File]::ReadAllText($file))
  $file=$privateStage
 }
 if($stageId -notmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'){
  throw 'Неверный UUID этапа'
 }
 $dbRoot=Get-RandomSecret 32
 $dbPassword=Get-RandomSecret 32
 $values=[ordered]@{
  VENUE_BIND_IP=$ip;VENUE_IMAGE_TAG=$sha;VENUE_STAGE_ID=$stageId
  VENUE_SIGNING_KEY_FINGERPRINT=$fingerprint
  VENUE_DB_NAME='usd_venue';VENUE_DB_ROOT_USER='usd_venue_root'
  VENUE_DB_ROOT_PASSWORD=$dbRoot;VENUE_DB_USER='usd_venue'
  VENUE_DB_PASSWORD=$dbPassword
  VENUE_DATABASE_URL=('postgresql://usd_venue:'+$dbPassword+'@db:5432/usd_venue?schema=public')
  VENUE_JWT_SECRET=(Get-RandomSecret 32)
  VENUE_S3_ROOT_ACCESS=('usdroot'+(Get-RandomSecret 8))
  VENUE_S3_ROOT_SECRET=(Get-RandomSecret 32)
  VENUE_S3_APP_ACCESS=('usdapp'+(Get-RandomSecret 8))
  VENUE_S3_APP_SECRET=(Get-RandomSecret 32)
 }
 $text=($values.GetEnumerator()|ForEach-Object {$_.Key+'='+$_.Value}) -join [Environment]::NewLine
 Write-PrivateFile $EnvFile ($text+[Environment]::NewLine)
 $state=[pscustomobject]@{
  format=1;phase='CONFIGURED';stageId=$stageId;fingerprint=$fingerprint
  ip=$ip;image=$sha;package=$file;publicKey=$key;demo=($kind -eq '1')
  accessKey=$(if($kind -eq '2'){$fileKey}else{$null})
 }
 Set-SetupPhase $state 'CONFIGURED'
 return $state
}
function Confirm-SignedStage([object]$State) {
 $config=Read-Env
 if($config['VENUE_STAGE_ID'] -ne $State.stageId -or
  $config['VENUE_SIGNING_KEY_FINGERPRINT'] -ne $State.fingerprint -or
  $config['VENUE_BIND_IP'] -ne $State.ip){throw 'Подменён этап или доверенный ключ'}
 if(!(Test-Path -LiteralPath $State.package) -or !(Test-Path -LiteralPath $State.publicKey)){
  throw 'Пакет этапа или доверенный открытый ключ больше не доступны'
 }
 $mounts=@('--volume',($State.package+':/app/venue-stage.json:ro'),
  '--volume',($State.publicKey+':/app/venue-signing-public.pem:ro'),
  '--volume',((Join-Path $Root 'verify-stage-package.mjs')+':/app/verify-stage-package.mjs:ro'))
 Invoke-Compose (@('run','--rm','--no-deps')+$mounts+
  @('--entrypoint','node','api','/app/verify-stage-package.mjs',
  '/app/venue-stage.json','/app/venue-signing-public.pem')) 'verify stage signature'
 return $mounts
}
function Ask-StrongPassword([string]$Name){
 return Read-VenuePassword $Name
}
function Create-Staff([string]$Kind,[string]$Login){
 $password=Ask-StrongPassword $Login
 try{
  $mounts=@('--volume',((Join-Path $Root 'import-stage.mjs')+':/app/import-stage.mjs:ro'),
   '--volume',((Join-Path $Root 'verify-stage-package.mjs')+':/app/verify-stage-package.mjs:ro'),
   '--volume',((Join-Path $Root 'provision-staff.mjs')+':/app/provision-staff.mjs:ro'))
  # The secret is passed only via stdin, never through command arguments.
  $password | & docker compose -p usd-venue -f (Join-Path $Root 'compose.yaml') run --rm --no-deps -T @mounts --entrypoint node api /app/provision-staff.mjs $Kind $Login
  Assert-Exit ('staff '+$Login)
 }finally{$password=$null}
}
function Create-ExistingStaff([object]$State,[array]$Mounts){
 if($State.demo -or [string]::IsNullOrWhiteSpace([string]$State.accessKey) -or
  !(Test-Path -LiteralPath $State.accessKey -PathType Leaf)){
  throw 'Для настоящего этапа требуется отдельный ключ существующих аккаунтов USD'
 }
 $staffMounts=@('--volume',($State.accessKey+':/app/venue-access-key.txt:ro'),
  '--volume',((Join-Path $Root 'import-stage.mjs')+':/app/import-stage.mjs:ro'),
  '--volume',((Join-Path $Root 'provision-staff.mjs')+':/app/provision-staff.mjs:ro'),
  '--volume',((Join-Path $Root 'provision-existing-staff.mjs')+':/app/provision-existing-staff.mjs:ro'))
 Invoke-Compose (@('run','--rm','--no-deps')+$Mounts+$staffMounts+
  @('--entrypoint','node','api','/app/provision-existing-staff.mjs',
  '/app/venue-stage.json','/app/venue-signing-public.pem','/app/venue-access-key.txt')) 'restore centrally approved staff logins'
}
function Install-Local {
 Assert-VenueCompose
 Ensure-DockerReady
 if(!(Test-Path -LiteralPath $PrivateDir)){
  New-Item -ItemType Directory -Path $PrivateDir|Out-Null
 }
 $state=Read-State
 if(!$state){$state=New-InitialState}
 $cfg=Read-Env
 if($cfg['VENUE_STAGE_ID'] -ne $state.stageId -or $cfg['VENUE_IMAGE_TAG'] -ne $state.image){
  throw 'Конфигурация этапа не совпадает с установкой'
 }
 Ensure-Firewall $state.ip
 Invoke-Compose @('config','--quiet') 'Docker Compose validation'
 if($state.phase -eq 'READY'){Start-Local;return}
 $mounts=Confirm-SignedStage $state
 if($state.phase -eq 'CONFIGURED'){
  Invoke-Compose @('pull') 'download images'
  Invoke-Compose @('up','-d','db','rustfs') 'start storage'
  $env:VENUE_S3_ROOT_ACCESS=$cfg['VENUE_S3_ROOT_ACCESS']
  $env:VENUE_S3_ROOT_SECRET=$cfg['VENUE_S3_ROOT_SECRET']
  try{
   Invoke-Compose @('run','--rm','--no-deps',
    '-e','VENUE_S3_ROOT_ACCESS','-e','VENUE_S3_ROOT_SECRET',
    '--volume',((Join-Path $Root 'provision-rustfs.mjs')+':/app/provision-rustfs.mjs:ro'),
    '--entrypoint','node','api','/app/provision-rustfs.mjs') 'setup RustFS IAM'
  }finally{
   Remove-Item Env:\VENUE_S3_ROOT_ACCESS -ErrorAction SilentlyContinue
   Remove-Item Env:\VENUE_S3_ROOT_SECRET -ErrorAction SilentlyContinue
  }
  Set-SetupPhase $state 'STORAGE_READY'
 }
 if($state.phase -eq 'STORAGE_READY'){
  Invoke-Compose @('up','-d','db','rustfs') 'start DB'
  Invoke-Compose @('run','--rm','--no-deps','--entrypoint',
   './node_modules/.bin/prisma','api','migrate','deploy',
   '--config','./prisma7.config.ts') 'migrate isolated DB'
  Set-SetupPhase $state 'SCHEMA_READY'
 }
 if($state.phase -eq 'SCHEMA_READY'){
  if(-not(Confirm-VenueAction ('Загрузить выбранный этап в отдельную локальную базу?'+[Environment]::NewLine+'Этап: '+$state.stageId+[Environment]::NewLine+'Основной сервер не изменяется.'))){throw 'Импорт отменён'}
  Invoke-Compose (@('run','--rm','--no-deps')+$mounts+
   @('--volume',((Join-Path $Root 'import-stage.mjs')+':/app/import-stage.mjs:ro'),
    '--entrypoint','node','api','/app/import-stage.mjs',
    '/app/venue-stage.json','/app/venue-signing-public.pem','--apply',$state.stageId)) 'signed stage import'
  Set-SetupPhase $state 'IMPORTED'
 }
 if($state.phase -eq 'IMPORTED'){
  Get-Content -LiteralPath (Join-Path $Root 'install-journal.sql') -Raw -Encoding UTF8 |
   & docker compose -p usd-venue -f (Join-Path $Root 'compose.yaml') exec -T db psql -v 'ON_ERROR_STOP=1' -U usd_venue_root -d usd_venue
  Assert-Exit 'append-only journal'
  Set-SetupPhase $state 'JOURNAL_READY'
 }
 if($state.phase -eq 'JOURNAL_READY'){
  if($state.demo){Create-Staff 'admin' 'operator1'}
  else{Create-ExistingStaff $state $mounts}
  Set-SetupPhase $state 'ADMIN_READY'
 }
 if($state.phase -eq 'ADMIN_READY'){
  if($state.demo){Create-Staff 'judge' 'judge-01'}
  Set-SetupPhase $state 'STAFF_READY'
 }
 if($state.phase -eq 'STAFF_READY'){
  Invoke-Compose @('up','-d') 'start HTTPS API and LIVE'
  Set-SetupPhase $state 'READY'
 }
 Start-Local
}
function Export-VenueCA {
 $destination=Join-Path $PrivateDir 'USD-Venue-CA.crt'
 if(Test-Path -LiteralPath $destination){return}
 try{
  $container=(& docker compose -p usd-venue -f (Join-Path $Root 'compose.yaml') ps -q gateway | Select-Object -First 1)
  if($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($container) -or
   $container -notmatch '^[a-f0-9]{12,64}$'){return}
  & docker cp ($container+':/data/caddy/pki/authorities/local/root.crt') $destination 2>$null | Out-Null
  if($LASTEXITCODE -ne 0){throw 'Caddy CA not ready'}
 }catch{
  if(Test-Path -LiteralPath $destination){Remove-Item -LiteralPath $destination -Force}
  if(-not $Silent){Write-Host 'Сертификат Caddy ещё не готов — повторите запуск позже.'}
 }
}
function Start-Local {
 Assert-VenueCompose
 $state=Read-State
 if(!$state -or $state.phase -ne 'READY'){throw 'Сначала завершите установку USD-Install.cmd'}
 $cfg=Read-Env
 if($cfg['VENUE_STAGE_ID'] -ne $state.stageId -or
  $cfg['VENUE_SIGNING_KEY_FINGERPRINT'] -ne $state.fingerprint -or
  $cfg['VENUE_BIND_IP'] -ne $state.ip){throw 'Закреплённый этап или IP изменён'}
 Ensure-DockerReady
 # Existing installations may have an older 18-trigger journal. Bring the
 # root-owned link trigger up to date WITHOUT clearing historic journal rows.
 # The coverage watermark prevents treating earlier untracked links as complete.
 Invoke-Compose @('up','-d','--wait','--no-build','--pull','never','db') 'start local DB for journal coverage check'
 Get-Content -LiteralPath (Join-Path $Root 'upgrade-journal-links.sql') -Raw -Encoding UTF8 |
  & docker compose -p usd-venue -f (Join-Path $Root 'compose.yaml') exec -T db psql -v 'ON_ERROR_STOP=1' -U usd_venue_root -d usd_venue
 Assert-Exit 'upgrade durable amplifier link journal'
 Invoke-Compose @('up','-d','--no-build','--pull','never') 'start offline without Internet'
 # Wait for a responding local API before opening the browser or exporting CA.
 $ready=$false
 for($i=0;$i -lt 40;$i++){
  if(Test-VenueApiReady){$ready=$true;break}
  Start-Sleep -Seconds 2
 }
 if(-not $ready){throw 'Сервер ещё не ответил. Подождите немного и нажмите «USD — Офлайн» снова. Данные сохранены.'}
 Save-Autostart
 Save-DesktopShortcuts
 Export-VenueCA
 if(-not $Silent){
  $url='https://'+$state.ip+'/login'
  Write-Host ('ОФЛАЙН USD: '+$url)
  Write-Host ('LIVE: https://'+$state.ip+'/venue/live')
  Write-Host 'Телефонам необходимо отдельно доверить локальный CA Caddy.'
  Start-Process $url
  Show-VenueMessage ('USD запущен.'+[Environment]::NewLine+'Вход: '+$url+[Environment]::NewLine+'Табло: https://'+$state.ip+'/venue/live'+[Environment]::NewLine+'Подключите телефоны к тому же Wi-Fi. Порядок установки сертификата — в инструкции на рабочем столе.')
 }
}
function Test-VenueApiReady {
 $prior=$ErrorActionPreference;$ErrorActionPreference='Continue'
 try{
  & docker compose -p usd-venue -f (Join-Path $Root 'compose.yaml') exec -T api node -e "fetch('http://127.0.0.1:3000/release').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>$null | Out-Null
  return ($LASTEXITCODE -eq 0)
 }catch{return $false}
 finally{$ErrorActionPreference=$prior}
}
function Export-VenueReturn {
 param([switch]$LeaveApiStopped,[switch]$Automatic)
 # This makes a signed ENCRYPTED USB file. It cannot synchronize with Ubuntu.
 # Never run in DEMO, use a central secret, or delete local durable records.
 if($Silent){throw 'Экспорт требует присутствия администратора и пароль'}
 Assert-VenueCompose
 $state=Read-State
 if(!$state -or $state.phase -ne 'READY'){throw 'Сначала завершите установку сервера USD'}
 if($state.demo){throw 'ДЕМО не может отправляться на основной сервер'}
 $cfg=Read-Env
 if($cfg['VENUE_STAGE_ID'] -ne $state.stageId -or
  $cfg['VENUE_IMAGE_TAG'] -ne $state.image -or
  $cfg['VENUE_SIGNING_KEY_FINGERPRINT'] -ne $state.fingerprint){
  throw 'Идентификатор этапа или его исходная подпись изменились'
 }
 Ensure-DockerReady
 $directory=Join-Path $PrivateDir 'return-output'
 New-Item -ItemType Directory -Path $directory -Force|Out-Null
 $volume='usd-venue_venue_return_keys'
 $keyTool=Join-Path $Root 'ensure-return-keys.mjs'
 $keyMounts=@('--volume',($volume+':/app/venue-return-keys:rw'),
  '--volume',($directory+':/app/venue-return-output:rw'),
  '--volume',($keyTool+':/app/ensure-return-keys.mjs:ro'))
 # Root is used only by an isolated, networkless one-shot key provisioner;
 # it hands the key volume to the regular non-root (node:1000) API image user.
 Invoke-Docker (@('run','--rm','--network','none','--user','root')+
  $keyMounts+@('--entrypoint','node',
  ('ghcr.io/kolyagazha89/usd-2.0-api:'+$state.image),
  '/app/ensure-return-keys.mjs','/app/venue-return-keys',
  '/app/venue-return-output')) 'create protected signing key'
 $publicKey=Join-Path $directory 'USD-Venue-Return-Public.pem'
 $fingerprintFile=Join-Path $directory 'USD-Venue-Return-Fingerprint.txt'
 if(!(Test-Path -LiteralPath $publicKey -PathType Leaf) -or
  !(Test-Path -LiteralPath $fingerprintFile -PathType Leaf)){
  throw 'Не удалось подготовить открытый ключ возвратного пакета'
 }
 $fingerprint=(Get-Content -LiteralPath $fingerprintFile -Raw -Encoding UTF8).Trim()
 if($fingerprint -cnotmatch '^[a-f0-9]{64}$'){throw 'Некорректный отпечаток ключа'}
 Invoke-Compose @('up','-d','--wait','db') 'start isolated DB for safe export'
 $date=[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')
 $filename=('usd-venue-return-'+$state.stageId+'-'+$date+'-'+[guid]::NewGuid().ToString('N').Substring(0,8)+'.json')
 $secret=$null
 if($Automatic){
  if(!(Test-Path -LiteralPath $state.package -PathType Leaf)){throw 'Нет исходного подписанного этапа'}
  $originalStage=Get-Content -LiteralPath $state.package -Raw -Encoding UTF8|ConvertFrom-Json
  $syncToken=[string]$originalStage.snapshot.syncAuthorization.token
  if($originalStage.snapshot.stageId -ne $state.stageId -or
   $syncToken -cnotmatch '^[A-Za-z0-9_-]{43}$' -or
   ([DateTime]$originalStage.snapshot.syncAuthorization.expiresAt).ToUniversalTime() -le [DateTime]::UtcNow){
   throw 'Пакет не разрешает автоматическую синхронизацию. Загрузите новый подписанный этап.'
  }
  $secret='UsdSync!1-'+$syncToken
 }else{$secret=Read-VenuePassword 'шифрования возвратного файла'}
 # A direct Export click is as important as the Online button: do NOT export
 # while a judge can still enter a result. Detect the prior API state so
 # export from a stopped server never starts it unexpectedly.
 $apiRunning=@(& docker compose -p usd-venue -f (Join-Path $Root 'compose.yaml') ps --status running -q api)
 Assert-Exit 'inspect currently running judge API'
 $apiWasRunning=@($apiRunning|Where-Object { -not [string]::IsNullOrWhiteSpace($_) }).Count -gt 0
 $apiStopped=$false
 $exportSucceeded=$false
 $returnFile=Join-Path $directory $filename
 try{
  if($apiWasRunning){
   Invoke-Compose @('stop','api') 'pause judging before consistent signed return export'
   $apiStopped=$true
  }
  $args=@('compose','-p','usd-venue','-f',(Join-Path $Root 'compose.yaml'),
   'run','--rm','--no-deps','-T',
   '--volume',($volume+':/app/venue-return-keys:ro'),
   '--volume',($directory+':/app/venue-return-output:rw'),
   '--volume',((Join-Path $Root 'import-stage.mjs')+':/app/import-stage.mjs:ro'),
   '--volume',((Join-Path $Root 'verify-stage-package.mjs')+':/app/verify-stage-package.mjs:ro'),
   '--volume',((Join-Path $Root 'venue-return-package.mjs')+':/app/venue-return-package.mjs:ro'),
   '--volume',((Join-Path $Root 'export-venue-return.mjs')+':/app/export-venue-return.mjs:ro'),
   '--entrypoint','node','api','/app/export-venue-return.mjs',
   '/app/venue-return-keys/venue-return-private.pem',
   ('/app/venue-return-output/'+$filename))
  # Password is sent over stdin ONLY, never exposed in arguments or logs.
  $output=@($secret | & docker @args)
  Assert-Exit 'signed encrypted USB return export'
  foreach($line in $output){Write-Host $line}
  $summaryLine=$output|Where-Object {$_ -match '^\{.*\}$'}|Select-Object -Last 1
  if(!$summaryLine){throw 'Экспорт не вернул контрольную сумму журнала'}
  $summary=$summaryLine|ConvertFrom-Json
  if([string]$summary.stageId -ne $state.stageId -or
   [string]$summary.journalEndHash -cnotmatch '^[a-f0-9]{64}$'){
   throw 'Неверный контрольный хеш экспортированного журнала'
  }
  if(!(Test-Path -LiteralPath $returnFile -PathType Leaf) -or
   (Get-Item -LiteralPath $returnFile).Length -lt 1){
   throw 'Экспорт не создан — журнал сохранён'
  }
  $exportSucceeded=$true
 }finally{
  $secret=$null
  # A standalone export must restore the judge API, whereas the Online
  # button intentionally leaves it frozen until the remaining stack stops.
  # Any failed export restores the previously running API in both modes.
  if($apiStopped -and ((-not $LeaveApiStopped) -or (-not $exportSucceeded))){
   Invoke-Compose @('up','-d','--no-build','--pull','never','api') 'restore judging after return export'
  }
 }
 if($Automatic){
  return [pscustomobject]@{
   path=$returnFile;publicKey=$publicKey;stageId=$state.stageId
   journalEndHash=[string]$summary.journalEndHash
  }
 }
 Write-Host ('ЗАШИФРОВАННЫЙ ФАЙЛ: '+$returnFile)
 Write-Host ('ОТКРЫТЫЙ КЛЮЧ: '+$publicKey)
 Write-Host ('ОТПЕЧАТОК КЛЮЧА: '+$fingerprint)
 Write-Host 'ЭТО НЕ СИНХРОНИЗАЦИЯ. Данные останутся на ноутбуке до подтверждения Ubuntu.'
 Show-VenueMessage ('Возвратный файл создан.'+[Environment]::NewLine+
  'Папка: '+$directory+[Environment]::NewLine+
  'Передайте шифрованный файл ответственному администратору USD.'+[Environment]::NewLine+
  'Открытый ключ и его отпечаток сверяются отдельно.'+[Environment]::NewLine+
  'Пароль сообщайте отдельно. Синхронизация НЕ завершена.'+[Environment]::NewLine+
  'НЕ УДАЛЯЙТЕ ДАННЫЕ НОУТБУКА.')
}
function Sync-VenueReturn([object]$Bundle){
 $state=Read-State
 if(!$state -or $state.demo -or $state.stageId -ne $Bundle.stageId){throw 'Неверный этап для центральной синхронизации'}
 $signed=Get-Content -LiteralPath $state.package -Raw -Encoding UTF8|ConvertFrom-Json
 $token=[string]$signed.snapshot.syncAuthorization.token
 if($token -cnotmatch '^[A-Za-z0-9_-]{43}$' -or
  ([DateTime]$signed.snapshot.syncAuthorization.expiresAt).ToUniversalTime() -le [DateTime]::UtcNow){
  throw 'Право автоматического возврата истекло. Данные ноутбука не удалены.'
 }
 $encrypted=[IO.File]::ReadAllText($Bundle.path).Trim()
 $pem=[IO.File]::ReadAllText($Bundle.publicKey)
 # Preserve the exact authenticated AES-GCM envelope JSON: ConvertTo-Json
 # of a large nested object can truncate it on Windows PowerShell 5.1.
 $body='{"stageId":'+(ConvertTo-Json -InputObject $Bundle.stageId -Compress)+
  ',"publicKeyPem":'+(ConvertTo-Json -InputObject $pem -Compress)+
  ',"envelope":'+$encrypted+'}'
 $SyncResult=Invoke-RestMethod -Uri 'https://api.usd-russia.ru/stages/venue/sync' -Method POST -Headers @{Authorization=('Venue '+$token)} -Body ([Text.Encoding]::UTF8.GetBytes($body)) -ContentType 'application/json; charset=utf-8' -TimeoutSec 180
 if($SyncResult.accepted -ne $true -or
  $SyncResult.databaseSynchronized -ne $true -or
  $SyncResult.derivedRankingsRebuilt -ne $true -or
  [string]$SyncResult.stageId -ne $Bundle.stageId -or
  [string]$SyncResult.journalEndHash -ne $Bundle.journalEndHash){
  throw 'Центральная Ubuntu не подтвердила все записи и пересчёт. Попробуйте ещё раз.'
 }
 $ack=Join-Path $PrivateDir ('sync-ack-'+$Bundle.journalEndHash+'.json')
 if(!(Test-Path -LiteralPath $ack)){
  Write-PrivateFile $ack ((@{accepted=$true;stageId=$Bundle.stageId;journalEndHash=$Bundle.journalEndHash;at=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json -Compress)+[Environment]::NewLine)
 }
 return $SyncResult
}
function Restore-VenueApi {
 Invoke-Compose @('up','-d','--no-build','--pull','never','api') 'restore local judging after failed sync'
}
function Return-Online {
 $state=Read-State
 if($state -and $state.phase -eq 'READY' -and (-not $state.demo)){
  if($Silent){throw 'Синхронизация реального этапа требует нажатия администратора'}
  $frozen=$false
  try{
   $bundle=Export-VenueReturn -LeaveApiStopped -Automatic
   $frozen=$true
   $SyncResult=Sync-VenueReturn -Bundle $bundle
   if($SyncResult.accepted -ne $true){throw 'Нет подтверждения ACKNOWLEDGED центрального сервера'}
  }catch{
   if($frozen){try{Restore-VenueApi}catch{Write-Host 'Локальная база сохранена. Откройте USD — Офлайн.'}}
   throw
  }
 }
 Remove-Autostart
 if(Get-Command docker -ErrorAction SilentlyContinue){
  if((Test-DockerReady) -and (Test-Path -LiteralPath $EnvFile)){
   Invoke-Compose @('stop') 'stop after central ACK without deleting local DB'
  }
 }
 Write-Host 'USD ONLINE. Synchronization ACKNOWLEDGED. Local backup preserved.'
 if(-not $Silent){Start-Process $OnlineUrl}
}
if($MyInvocation.InvocationName -eq '.'){return}
try{
 if(-not $Silent){. (Join-Path $Root 'venue-dialogs.ps1')}
 if($Action -eq 'install'){Install-Local}
 elseif($Action -eq 'offline'){Start-Local}
 elseif($Action -eq 'export'){Export-VenueReturn}
 else{Return-Online}
}catch{
 Write-Host ('USD VENUE: не удалось безопасно выполнить действие '+$Action) -ForegroundColor Red
 if(!$Silent){Write-Host ('Причина: '+$_.Exception.Message)}
 if(!$Silent -and (Get-Command Show-VenueMessage -ErrorAction SilentlyContinue)){
  Show-VenueMessage ('Действие не завершено.'+[Environment]::NewLine+$_.Exception.Message+[Environment]::NewLine+'Ничего не удаляйте. Устраните причину и нажмите ту же кнопку снова.')
 }
 Write-Host 'Ничего не удаляйте. После устранения причины повторите тот же запуск.'
 exit 1
}
