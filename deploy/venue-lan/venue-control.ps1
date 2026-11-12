#requires -Version 5.1
<#
 USD venue Windows manager. Signed one-stage install, one-click offline/online.
 No production DB credentials are ever used. Docker Desktop must use Linux.
#>
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][ValidateSet('install','offline','online')][string]$Action,
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
 & docker @Arguments
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
function Ensure-DockerReady {
 if(-not(Get-Command docker -ErrorAction SilentlyContinue)){
  if($Action -eq 'install' -and (Get-Command winget -ErrorAction SilentlyContinue)){
   Write-Host 'Docker Desktop отсутствует. Нужно установить Linux containers с WSL2.'
   $yes=Read-Host 'Установить Docker Desktop через winget? (ДА/НЕТ)'
   if($yes -eq 'ДА'){
    & winget install -e --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements
    Assert-Exit 'Docker Desktop install'
    throw 'Завершите настройку Docker Desktop и WSL2 (может понадобиться перезагрузка), затем нажмите кнопку ещё раз.'
   }
  }
  throw 'Нужен Docker Desktop: https://docs.docker.com/desktop/setup/install/windows-install/'
 }
 & docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
 if($LASTEXITCODE -eq 0){return}
 $executable=Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
 if(Test-Path -LiteralPath $executable){Start-Process -FilePath $executable|Out-Null}
 for($i=0;$i -lt 60;$i++){
  Start-Sleep -Seconds 2
  & docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
  if($LASTEXITCODE -eq 0){return}
 }
 throw 'Docker Desktop не готов. Проверьте WSL2, лицензию и режим Linux containers.'
}
function Get-PrivateLanIp {
 $ips=@(Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
  $_.AddressState -eq 'Preferred' -and
  ($_.IPAddress -match '^192\.168\.' -or $_.IPAddress -match '^10\.' -or
   $_.IPAddress -match '^172\.(1[6-9]|2[0-9]|3[01])\.')
 } | Select-Object -ExpandProperty IPAddress -Unique)
 if($ips.Count -eq 0){throw 'Подключите ноутбук к выделенному Wi-Fi-роутеру и назначьте частный IP'}
 Write-Host ('IP ноутбука: '+($ips -join ', '))
 $ip=Read-Host 'Введите частный IP именно Wi-Fi роутера'
 if($ip -notin $ips){throw 'IP не принадлежит ноутбуку'}
 return $ip
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
function Select-LocalFile([string]$Label){
 $candidate=Read-Host $Label
 if(!$candidate){throw 'Файл не выбран'}
 $path=(Resolve-Path -LiteralPath $candidate.Trim('"')).Path
 if(-not(Test-Path -LiteralPath $path -PathType Leaf)){throw 'Файл не найден'}
 return $path
}
function New-InitialState {
 if(Test-Path -LiteralPath $EnvFile){throw '.env существует без маркера установки. Нельзя затирать чужую конфигурацию.'}
 $ip=Get-PrivateLanIp
 Write-Host '1 = ДЕМО на вымышленных участниках, 2 = реальный подписанный экспорт USD.'
 $kind=Read-Host 'Выберите 1 или 2'
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
  $file=Select-LocalFile 'Полный путь к подписанному stage.json'
  $key=Select-LocalFile 'Полный путь к доверенному signing-public.pem'
  $payload=Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json
  $stageId=[string]$payload.snapshot.stageId
  $fingerprint=Read-Host 'Trusted fingerprint из независимого источника (64 hex)'
  if($fingerprint -cnotmatch '^[a-f0-9]{64}$'){throw 'Нет независимого доверенного отпечатка Ed25519'}
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
 Write-Host ('Задайте пароль '+$Name+': минимум 16 ASCII-символов, A-Z, a-z, цифра и знак.')
 $a=Read-Host 'Пароль' -AsSecureString
 $b=Read-Host 'Повтор' -AsSecureString
 $one=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($a)
 $two=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($b)
 try{
  $first=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($one)
  $second=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($two)
  if($first -cne $second -or $first.Length -lt 16 -or
   $first -cnotmatch '[A-Z]' -or $first -cnotmatch '[a-z]' -or
   $first -notmatch '[0-9]' -or $first -notmatch '[^a-zA-Z0-9]' -or
   $first -notmatch '^[\x21-\x7e]+$'){throw 'Неверный или не совпавший пароль'}
  return $first
 }finally{
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($one)
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($two)
 }
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
  $typed=Read-Host ('Введите UUID этапа для импорта: '+$state.stageId)
  if($typed -ne $state.stageId){throw 'UUID не совпадает'}
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
  Create-Staff 'admin' 'operator1'
  Set-SetupPhase $state 'ADMIN_READY'
 }
 if($state.phase -eq 'ADMIN_READY'){
  Create-Staff 'judge' 'judge-01'
  Set-SetupPhase $state 'STAFF_READY'
 }
 if($state.phase -eq 'STAFF_READY'){
  Invoke-Compose @('up','-d') 'start HTTPS API and LIVE'
  Set-SetupPhase $state 'READY'
 }
 Start-Local
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
 Invoke-Compose @('up','-d','--no-build','--pull','never') 'start offline without Internet'
 Save-Autostart
 if(-not $Silent){
  $url='https://'+$state.ip+'/login'
  Write-Host ('ОФЛАЙН USD: '+$url)
  Write-Host ('LIVE: https://'+$state.ip+'/venue/live')
  Write-Host 'Телефонам необходимо отдельно доверить локальный CA Caddy.'
  Start-Process $url
 }
}
function Return-Online {
 # Online switching never implies synchronization. Preserve all unsynced data.
 Remove-Autostart
 if(Get-Command docker -ErrorAction SilentlyContinue){
  & docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
  if($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $EnvFile)){
   Invoke-Compose @('stop') 'stop without deleting local DB and journal'
  }
 }
 Write-Host 'USD ONLINE. Local DB and journal preserved, all changes UNSYNCED.'
 Write-Host 'Это только возврат на сайт. Обратная синхронизация требует отдельной проверки.'
 if(-not $Silent){Start-Process $OnlineUrl}
}
try{
 if($Action -eq 'install'){Install-Local}
 elseif($Action -eq 'offline'){Start-Local}
 else{Return-Online}
}catch{
 Write-Host ('USD VENUE: не удалось безопасно выполнить действие '+$Action) -ForegroundColor Red
 if(!$Silent){Write-Host ('Причина: '+$_.Exception.Message)}
 Write-Host 'Ничего не удаляйте. После устранения причины повторите тот же запуск.'
 exit 1
}
