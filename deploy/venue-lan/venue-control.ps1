#requires -Version 5.1
<#
 USD venue Windows manager. Signed one-stage install, one-click offline/online.
 No production DB credentials are ever used. Docker Desktop must use Linux.
#>
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][ValidateSet('install','offline','online','export','next','certificate','directory')][string]$Action,
 [string]$StageFile='',
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
$script:VenueStep='initialization'
function Set-VenueStep([string]$Name){
 $script:VenueStep=$Name
 Write-Host ('USD VENUE STEP: '+$Name)
}
$Phases=@('CONFIGURED','STORAGE_READY','SCHEMA_READY','IMPORTED','JOURNAL_READY','ADMIN_READY','STAFF_READY','READY')

function Get-RandomSecret([int]$Size=32){
 $buffer=New-Object byte[] $Size
 $rng=[System.Security.Cryptography.RandomNumberGenerator]::Create()
 try {$rng.GetBytes($buffer)} finally {$rng.Dispose()}
 return (-join ($buffer | ForEach-Object {$_.ToString('x2')}))
}
function Assert-Exit([string]$Purpose){
 if($LASTEXITCODE -ne 0){throw ('USD VENUE '+$Purpose+' step='+$script:VenueStep+' failed with exit '+$LASTEXITCODE)}
}
function Invoke-Docker([string[]]$Arguments,[string]$Purpose){
 try{
  & docker @Arguments | Out-Host
 }catch{
  throw ('USD VENUE '+$Purpose+' step='+$script:VenueStep+': '+$_.Exception.Message)
 }
 Assert-Exit $Purpose
}
function Invoke-Compose([string[]]$Arguments,[string]$Purpose){
 Invoke-Docker ((Get-VenueComposeArguments)+$Arguments) $Purpose
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
function Read-Env([string]$Path=$EnvFile) {
 if(-not(Test-Path -LiteralPath $Path -PathType Leaf)){throw 'Нет локальной конфигурации. Запустите установку.'}
 $result=@{}
 foreach($line in [IO.File]::ReadAllLines($Path)){
  $row=$line.Trim()
  if(!$row -or $row.StartsWith('#')){continue}
   $at=$row.IndexOf('=')
  if($at -le 0){throw 'Некорректный .env'}
  $name=$row.Substring(0,$at)
  if($name -cnotmatch '^VENUE_[A-Z0-9_]+$' -or $result.ContainsKey($name)){
   throw 'Некорректный .env'
  }
  $result[$name]=$row.Substring($at+1)
 }
 return $result
}
function Write-PrivateFile([string]$Path,[string]$Value){
 # Protect secrets before writing.
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
# Immutable operator inputs must survive retry if Windows stops before the
# setup state is committed. Never overwrite a DIFFERENT signed stage, key or
# access secret: this could silently change the identity of an event.
function Write-VenueImmutableBootstrapFile([string]$Path,[string]$Value){
 if(Test-Path -LiteralPath $Path){
  if(!(Test-Path -LiteralPath $Path -PathType Leaf)){throw 'Файл первоначальной установки повреждён. Данные сохранены.'}
  if(-not ([IO.File]::GetAccessControl($Path)).AreAccessRulesProtected){
   throw 'Защищённый файл первоначальной установки имеет небезопасные права. Данные сохранены.'
  }
  if([IO.File]::ReadAllText($Path) -cne $Value){
   throw 'Сохранённый файл первоначальной установки отличается от выбранного. Ничего не перезаписано.'
  }
  return
 }
 Write-PrivateFile $Path $Value
}
function Read-State {
 if(!(Test-Path -LiteralPath $StateFile)){return $null}
 $s=Get-Content -LiteralPath $StateFile -Raw -Encoding UTF8|ConvertFrom-Json
 if($s -and $s.PSObject.Properties.Name -contains 'demo' -and $s.demo -eq $true -and $Action -ne 'install'){
  throw 'Старая пробная база больше не поддерживается. Запустите USD-Install.cmd для замены на реальный этап.'
 }
 if(!$s -or $s.phase -notin $Phases -or
  $s.stageId -notmatch '^[0-9a-f-]{36}$' -or $s.fingerprint -notmatch '^[0-9a-f]{64}$'){
  throw 'Метаданные установки повреждены: не трогайте Docker volumes'
 }
 # Normalize old DEMO state.
 if($s.PSObject.Properties.Name -notcontains 'accessKey'){
  $s|Add-Member -NotePropertyName accessKey -NotePropertyValue $null
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
  throw 'Docker Desktop не найден. Установите с docker.com и запустите Linux containers/WSL2. USD не удаляет Docker Desktop.'
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
function Test-VenueFirewallRule([string]$Ip){
 # Verify the actual firewall rule.
 $name='USD Venue HTTPS '+$Ip
 $rules=@(Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue)
 if($rules.Count -ne 1){return $false}
 $rule=$rules[0]
 if([string]$rule.Enabled -ne 'True' -or [string]$rule.Direction -ne 'Inbound' -or
    [string]$rule.Action -ne 'Allow' -or [string]$rule.Profile -ne 'Private'){
  return $false
 }
 try{
  $port=$rule|Get-NetFirewallPortFilter -ErrorAction Stop
  $address=$rule|Get-NetFirewallAddressFilter -ErrorAction Stop
  $ports=@($port.LocalPort | ForEach-Object { [string]$_ -split ',' } | ForEach-Object { $_.Trim() })
  return (
   [string]$port.Protocol -in @('TCP','6') -and
   $ports.Count -eq 2 -and
   $ports -contains '80' -and $ports -contains '443' -and
   [string]$address.LocalAddress -eq $Ip -and
   [string]$address.RemoteAddress -eq 'LocalSubnet'
  )
 }catch{return $false}
}
function Test-VenueElevated {
 $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
 return ([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
function Ensure-Firewall([string]$Ip){
 $interface=Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
  Where-Object {$_.IPAddress -eq $Ip -and $_.AddressState -eq 'Preferred'} |
  Select-Object -First 1
 if(!$interface){throw 'Выбранный IP уже отсутствует на ноутбуке. Подключитесь к Wi-Fi роутера и повторите установку.'}
 $profile=Get-NetConnectionProfile -InterfaceIndex $interface.InterfaceIndex -ErrorAction Stop
 if(!$profile){throw 'Windows не определила профиль выбранного Wi-Fi. Подключитесь к роутеру повторно.'}
 $approvePrivate=$false
 if([string]$profile.NetworkCategory -ne 'Private'){
  if([string]$profile.NetworkCategory -ne 'Public'){
   throw 'Сеть Windows управляется организацией или имеет неподдерживаемый профиль. Выберите отдельный Wi-Fi роутер судей.'
  }
  $message='Windows считает выбранный Wi-Fi общедоступным. Для доступа телефонов нужен частный профиль сети. Изменить ТОЛЬКО эту сеть на «Частная» и разрешить HTTPS (TCP 443) только своей подсети (вход HTTPS 443 и табло HTTP 80)?'
  if(-not(Confirm-VenueAction $message)){
   throw 'Wi-Fi сейчас «Общедоступная». Откройте Параметры Windows -> Сеть и Интернет -> свойства подключённого Wi-Fi -> профиль «Частная» и запустите установку снова.'
  }
  $approvePrivate=$true
 }
 if(Test-VenueFirewallRule $Ip){return}
 $script=Join-Path $Root 'venue-firewall.ps1'
 $arguments='-NoProfile -ExecutionPolicy Bypass -File "'+$script+'" -Ip "'+$Ip+'"'
 if($approvePrivate){$arguments+=' -AllowPrivateProfile'}
 $exitCode=$null
 try{
  if(Test-VenueElevated){
   $helperArgs=@('-NoProfile','-ExecutionPolicy','Bypass','-File',$script,'-Ip',$Ip)
   if($approvePrivate){$helperArgs+='-AllowPrivateProfile'}
   & powershell.exe @helperArgs | Out-Host
   $exitCode=$LASTEXITCODE
  }else{
   Write-Host 'Подтвердите запрос администратора Windows (UAC).'
   $task=Start-Process powershell.exe -Verb RunAs -ArgumentList $arguments -Wait -PassThru
   $exitCode=$task.ExitCode
  }
 }catch{
  throw ('Настройка брандмауэра Windows/UAC: '+$_.Exception.Message)
 }
 switch([int]$exitCode){
  0 {break}
  20 {throw 'Сеть не является частной. Установите профиль Wi-Fi «Частная» в параметрах Windows и повторите запуск.'}
  21 {throw 'Windows не разрешила сделать выбранную сеть частной. Проверьте права администратора или политику сети.'}
  22 {throw 'Не удалось добавить LAN-правило на порты 80 и 443. Проверьте брандмауэр Windows или системные ограничения.'}
  23 {throw 'Созданное правило порта 443 не соответствует безопасным параметрам. Проверьте настройки брандмауэра.'}
  24 {throw 'Windows не разрешила безопасно восстановить существующее правило USD. Не удаляйте другие правила брандмауэра.'}
  default {throw 'Административная настройка брандмауэра завершилась ошибкой. Проверьте профиль сети, UAC и защиту Windows.'}
 }
 $check=Get-NetConnectionProfile -InterfaceIndex $interface.InterfaceIndex -ErrorAction Stop
 if([string]$check.NetworkCategory -ne 'Private' -or -not(Test-VenueFirewallRule $Ip)){
  throw 'Правило было запрошено, но Windows не подтвердила безопасный доступ. Проверьте профиль «Частная» и системный брандмауэр.'
 }
}
function Save-Autostart {
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
 foreach($item in @(@('USD — Офлайн','offline'),@('USD — Онлайн','online'),@('USD — Экспорт','export'),@('USD — Профили','directory'),@('USD — Следующий этап','next'),@('USD — Сертификат','certificate'))){
  $shortcut=$shell.CreateShortcut((Join-Path $desktop ($item[0]+'.lnk')))
  $shortcut.TargetPath=(Join-Path $PSHOME 'powershell.exe')
  $shortcut.Arguments='-NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $Root 'venue-control.ps1')+'" -Action '+$item[1]
  $shortcut.WorkingDirectory=$Root;$shortcut.Save()
 }
 $help=$shell.CreateShortcut((Join-Path $desktop 'USD — Инструкция.lnk'))
 $help.TargetPath=(Join-Path $Root 'INSTRUCTION.html');$help.Save()
}
# PS5.1 native Go templates.
function Read-VenueDockerLabels([ValidateSet('container','image')][string]$Kind,[string]$Identity){
 if([string]::IsNullOrWhiteSpace($Identity)){throw 'Docker object ID is missing'}
 $arguments=$(if($Kind -eq 'container'){
  @('inspect','--format','{{json .Config.Labels}}',$Identity)
 }else{
  @('image','inspect','--format','{{json .Config.Labels}}',$Identity)
 })
 $output=@(& docker @arguments 2>$null)
 Assert-Exit 'inspect Docker labels'
 if($output.Count -ne 1){throw 'Docker did not return exactly one label map'}
 try{$labels=ConvertFrom-Json -InputObject ([string]$output[0]) -ErrorAction Stop}
 catch{throw 'Docker returned invalid JSON labels'}
 if($null -eq $labels -or $labels -isnot [pscustomobject]){
  throw 'Docker object is missing its trusted labels'
 }
 return $labels
}
function Assert-VenueReleaseImages([string]$Sha){
 if($Sha -cnotmatch '^[a-f0-9]{40}$'){throw 'Неверная версия USD'}
 foreach($name in @('api','frontend')){
  $ref='ghcr.io/kolyagazha89/usd-2.0-'+$name+':'+$Sha
  $labels=Read-VenueDockerLabels 'image' $ref
  if([string]$labels.'org.opencontainers.image.revision' -cne $Sha){
   throw 'Образы USD ещё не совпадают с подтверждённой версией сервера. Завершите обновление Ubuntu и повторите установку.'
  }
 }
 $apiImage='ghcr.io/kolyagazha89/usd-2.0-api:'+$Sha
 $program=@'
const fs=require("node:fs");
const sha=process.argv[2];
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
if(!fs.readFileSync("/app/dist/prisma/prisma.service.js","utf8").includes("venue_private.active_stage"))process.exit(6);
console.log("USD VENUE API RELEASE CHECK PASSED");
'@
 $program | & docker run --rm -i --network none --entrypoint node $apiImage - $Sha | Out-Host
 if($LASTEXITCODE -ne 0){
  throw 'На Ubuntu установлена старая версия USD без полного офлайн-режима. Ничего не установлено; повторите после обновления.'
 }
}
# Keep venue installations isolated.
function Replace-LegacyDemo([object]$State){
 if($State.demo -ne $true -or $State.phase -ne 'READY' -or $State.accessKey){
  throw 'Автоматически очистить можно только завершённую старую пробную установку. Данные сохранены.'
 }
 $cfg=Read-Env
 if($cfg['VENUE_STAGE_ID'] -ne $State.stageId -or
  $cfg['VENUE_IMAGE_TAG'] -ne $State.image -or
  $cfg['VENUE_SIGNING_KEY_FINGERPRINT'] -ne $State.fingerprint -or
  $cfg['VENUE_BIND_IP'] -ne $State.ip){
  throw 'Идентификаторы старой пробной установки не совпадают; очистка запрещена.'
 }
 if(Test-Path -LiteralPath (Join-Path $PrivateDir 'return-output')){
  throw 'Найдены возвратные файлы. Установка не удалена: сохраните их и проверьте данные вручную.'
 }
 $containers=@(& docker ps -a --filter 'label=com.docker.compose.project=usd-venue' --format '{{.ID}}')
 Assert-Exit 'check venue containers before cleanup'
 foreach($id in $containers){
  if([string]$id -cnotmatch '^[a-f0-9]{12,64}$'){throw 'Docker вернул неверный ID контейнера'}
  $labels=Read-VenueDockerLabels 'container' ([string]$id)
  if([string]$labels.'com.docker.compose.project' -cne 'usd-venue' -or
   [string]$labels.'com.docker.compose.service' -cnotin @('db','api','frontend','rustfs','gateway')){
   throw 'В проекте есть неизвестный контейнер. Очистка отменена.'
  }
 }
 $volumes=@(& docker volume ls --filter 'label=com.docker.compose.project=usd-venue' --format '{{.Name}}')
 Assert-Exit 'check venue volumes before cleanup'
 foreach($volume in $volumes){
  if($volume -notin @('usd-venue_venue_db','usd-venue_venue_media','usd-venue_venue_ca',
    'usd-venue_venue_caddy_config','usd-venue_venue_return_keys')){
   throw 'В проекте есть неизвестный Docker-том. Очистка отменена.'
  }
 }
 if(-not(Confirm-VenueAction ('Старая пробная база USD будет удалена БЕЗ ВОССТАНОВЛЕНИЯ.'+
  [Environment]::NewLine+'Этап: '+$State.stageId+
  [Environment]::NewLine+'Удаляем только проект usd-venue и его тестовые данные. Основной сервер Ubuntu не затрагивается.'+
  [Environment]::NewLine+'Продолжить и установить настоящий этап?'))){
  throw 'Очистка отменена, старая база сохранена.'
 }
 Remove-Autostart
 Invoke-Compose @('down','--volumes') 'remove confirmed retired test volumes'
 Remove-Item -LiteralPath $EnvFile -Force
 Remove-Item -LiteralPath $PrivateDir -Recurse -Force
 foreach($legacy in @('make-demo-stage.mjs','provision-staff.mjs')){
  $obsolete=Join-Path $Root $legacy
  if(Test-Path -LiteralPath $obsolete -PathType Leaf){Remove-Item -LiteralPath $obsolete -Force}
 }
 New-Item -ItemType Directory -Path $PrivateDir|Out-Null
 Write-Host 'Старая пробная база удалена. Продолжаем установку подписанного этапа.'
}
function New-InitialState {
 if(Test-Path -LiteralPath $EnvFile){throw '.env существует без маркера установки. Нельзя затирать чужую конфигурацию.'}
 $source=$null;$sharedConfig=$null
 $sharedFile=Join-Path $Root 'shared-source.json'
 if(Test-Path -LiteralPath $sharedFile){
  $source=Get-Content -LiteralPath $sharedFile -Raw -Encoding UTF8|ConvertFrom-Json
  $sharedConfig=Read-Env (Join-Path ([string]$source.workspace) '.env')
 }
 $ip=$(if($sharedConfig){$sharedConfig['VENUE_BIND_IP']}else{Get-PrivateLanIp})
 $sha=Get-VenueReleaseSha $sharedConfig
 $file='';$key='';$stageId='';$fingerprint=''
 $file=$(if($StageFile){$StageFile}else{Select-VenueFile 'Выберите файл этапа, скачанный из админки USD' 'Файл этапа (*.json)|*.json'})
 if(!(Test-Path -LiteralPath $file -PathType Leaf)){throw 'Файл этапа отсутствует'}
  $payload=Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json
  $trustedSource=$(if($source){Get-Content -LiteralPath (Join-Path ([string]$source.workspace) 'local-private/setup-state.json') -Raw -Encoding UTF8|ConvertFrom-Json}else{$null})
  $reuseTrust=$trustedSource -and (Test-Path -LiteralPath ([string]$trustedSource.publicKey)) -and ([string]$payload.integrity.publicKeyFingerprint -ceq [string]$trustedSource.fingerprint)
  $key=$(if($reuseTrust){[string]$trustedSource.publicKey}else{Select-VenueFile 'Выберите открытый ключ из админки USD' 'Открытый ключ (*.pem)|*.pem'})
  $payload=Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json
  $stageId=[string]$payload.snapshot.stageId
  $project=Get-VenueProjectForStage $stageId
  if($source){$project=[string]$source.project}else{Assert-NoOrphanedVenueStack $project}
  # trusted fingerprint verified by admin.
  $fingerprint=$(if($reuseTrust){[string]$trustedSource.fingerprint}else{(Read-VenueFingerprint).Trim()})
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
  Write-VenueImmutableBootstrapFile $privateAccess $keyValue
  $fileKey=$privateAccess
  $privateStage=Join-Path $PrivateDir 'signed-real-stage.json'
  Write-VenueImmutableBootstrapFile $privateStage ([IO.File]::ReadAllText($file))
  $file=$privateStage
  # Do not depend on Downloads/USB after setup: pin the independently
  # verified trust material to the same ACL-protected durable workspace.
  $privatePublicKey=Join-Path $PrivateDir 'venue-signing-public.pem'
  Write-VenueImmutableBootstrapFile $privatePublicKey ([IO.File]::ReadAllText($key))
  $key=$privatePublicKey
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
 if($sharedConfig){
  foreach($name in @($values.Keys)){
   if($name -notin @('VENUE_STAGE_ID','VENUE_IMAGE_TAG','VENUE_SIGNING_KEY_FINGERPRINT','VENUE_JWT_SECRET')){
    $values[$name]=$sharedConfig[$name]
   }
  }
  Copy-VenueWebVersion $values $sharedConfig
 }
 $text=($values.GetEnumerator()|ForEach-Object {$_.Key+'='+$_.Value}) -join [Environment]::NewLine
 Write-PrivateFile $EnvFile ($text+[Environment]::NewLine)
 $state=[pscustomobject]@{
  format=1;phase='CONFIGURED';stageId=$stageId;fingerprint=$fingerprint
  ip=$ip;image=$sha;package=$file;publicKey=$key;accessKey=$fileKey
  project=$project;home=(Get-VenueHome);shared=($null -ne $source)
  projectStageId=$(if($source){[string]$source.projectStageId}else{$stageId})
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
  '--volume',((Join-Path $Root 'verify-stage-package.mjs')+':/app/verify-stage-package.mjs:ro'),
  '--volume',((Join-Path $Root 'import-stage.mjs')+':/app/import-stage.mjs:ro'))
 $preImport=[array]::IndexOf($Phases,[string]$State.phase) -lt [array]::IndexOf($Phases,'IMPORTED')
 $verificationMode=$(if($preImport){'--dry-run'}else{'--check-installed'})
 Invoke-Compose (@('run','--rm','--no-deps')+$mounts+
  @('--entrypoint','node','api','/app/import-stage.mjs',
  '/app/venue-stage.json','/app/venue-signing-public.pem',$verificationMode)) 'verify stage signature or exact installed receipt'
 Confirm-VenueStaffKey $State $mounts
 return $mounts
}
function Install-Local {
 Set-VenueStep 'check-docker'
 Assert-VenueCompose
 Ensure-DockerReady
 if(!(Test-Path -LiteralPath $PrivateDir)){
  New-Item -ItemType Directory -Path $PrivateDir|Out-Null
 }
 $state=Read-State
 if($state -and $state.PSObject.Properties.Name -contains 'demo' -and $state.demo -eq $true){
  Set-VenueStep 'remove-confirmed-old-demo'
  Replace-LegacyDemo $state
  $state=$null
 }
 if(!$state){
  Set-VenueStep 'select-signed-stage-and-verify-release'
  $state=New-InitialState
 }
 $cfg=Read-Env
 if($cfg['VENUE_STAGE_ID'] -ne $state.stageId -or $cfg['VENUE_IMAGE_TAG'] -ne $state.image){
  throw 'Конфигурация этапа не совпадает с установкой'
 }
 Set-VenueStep 'configure-firewall'
 Ensure-Firewall $state.ip
 Set-VenueStep 'validate-compose'
 Invoke-Compose @('config','--quiet') 'Docker Compose validation'
 if($state.phase -eq 'READY'){Update-ReadyVenueFrontend $state;Start-Local;return}
 Set-VenueStep 'check-other-stage-ports'
 Assert-NoOtherVenueGatewayRunning
 if($state.phase -ne 'CONFIGURED'){Start-VenueDatabase}
 Set-VenueStep 'verify-stage-and-staff'
 $mounts=Confirm-SignedStage $state
 if($state.phase -eq 'CONFIGURED'){
  Set-VenueStep 'download-images'
  if(!($state.PSObject.Properties.Name -contains 'shared' -and $state.shared) -and
     -not(Test-VenueRuntimeImagesCached $state.image)){
   Set-VenueStep 'download-missing-runtime-images'
   Invoke-Compose @('pull') 'download missing runtime images'
  }
  if(!($state.PSObject.Properties.Name -contains 'shared' -and $state.shared)){
   Set-VenueStep 'prepare-media-volume'
   Initialize-VenueMediaVolume
  }
  Set-VenueStep 'start-storage'
  Invoke-Compose @('up','-d','--no-build','--no-recreate','--pull','never','db','rustfs') 'start storage'
  if(!($state.PSObject.Properties.Name -contains 'shared' -and $state.shared)){
  $env:VENUE_S3_ROOT_ACCESS=$cfg['VENUE_S3_ROOT_ACCESS']
  $env:VENUE_S3_ROOT_SECRET=$cfg['VENUE_S3_ROOT_SECRET']
  $env:USD_VENUE_INSTALL_DIAG='true'
  try{
   Invoke-Compose @('run','--rm','--no-deps',
    '-e','VENUE_S3_ROOT_ACCESS','-e','VENUE_S3_ROOT_SECRET','-e','USD_VENUE_INSTALL_DIAG',
    '--volume',((Join-Path $Root 'provision-rustfs.mjs')+':/app/provision-rustfs.mjs:ro'),
    '--entrypoint','node','api','/app/provision-rustfs.mjs') 'setup RustFS IAM'
  }finally{
   Remove-Item Env:\VENUE_S3_ROOT_ACCESS -ErrorAction SilentlyContinue
   Remove-Item Env:\VENUE_S3_ROOT_SECRET -ErrorAction SilentlyContinue
   Remove-Item Env:\USD_VENUE_INSTALL_DIAG -ErrorAction SilentlyContinue
  }
  }
  Set-SetupPhase $state 'STORAGE_READY'
 }
 if($state.phase -eq 'STORAGE_READY'){
  Set-VenueStep 'migrate-local-db'
  Invoke-Compose @('up','-d','--no-build','--no-recreate','--pull','never','db','rustfs') 'start DB'
  Invoke-Compose @('run','--rm','--no-deps','--entrypoint',
   './node_modules/.bin/prisma','api','migrate','deploy',
   '--config','./prisma7.config.ts') 'migrate isolated DB'
  Set-SetupPhase $state 'SCHEMA_READY'
 }
 if($state.phase -eq 'SCHEMA_READY'){
  Set-VenueStep 'verify-local-db-roles'
  Assert-VenueDatabaseImportRole
  Set-VenueStep 'import-signed-stage'
  $isShared=$state.PSObject.Properties.Name -contains 'shared' -and $state.shared
  if($isShared){
   Import-SharedVenueStage $state $cfg $mounts
  }else{
   Invoke-Compose (@('run','--rm','--no-deps')+$mounts+
    @(     '--entrypoint','node','api','/app/import-stage.mjs',
     '/app/venue-stage.json','/app/venue-signing-public.pem','--apply',$state.stageId)) 'signed stage import'
  }
  Set-SetupPhase $state 'IMPORTED'
 }
 if($state.phase -eq 'IMPORTED'){
  Set-VenueStep 'install-journal'
   $installed=@(& docker @(Get-VenueComposeArguments) exec -T db psql -X -A -t -v 'ON_ERROR_STOP=1' -U usd_venue_root -d usd_venue -c "SELECT to_regclass('venue_private.operation_journal');")
  Assert-Exit 'inspect journal after resumed import'
  $journalFile=$(if($installed -contains 'venue_private.operation_journal'){'upgrade-journal-links.sql'}else{'install-journal.sql'})
  if($journalFile -eq 'upgrade-journal-links.sql'){Repair-VenueCoverageIfNeeded}
  Get-Content -LiteralPath (Join-Path $Root $journalFile) -Raw -Encoding UTF8 |
   & docker @(Get-VenueComposeArguments) exec -T db psql -v 'ON_ERROR_STOP=1' -U usd_venue_root -d usd_venue
  Assert-Exit 'append-only journal'
  Set-SetupPhase $state 'JOURNAL_READY'
 }
 if($state.phase -eq 'JOURNAL_READY'){
  Set-VenueStep 'authorize-staff'
  Create-ExistingStaff $state $mounts
  Set-SetupPhase $state 'ADMIN_READY'
 }
 if($state.phase -eq 'ADMIN_READY'){
  Set-SetupPhase $state 'STAFF_READY'
 }
 if($state.phase -eq 'STAFF_READY'){
  Set-VenueStep 'start-lan-services'
  Assert-NoOtherVenueGatewayRunning
  Assert-VenueVolumeRetained @('venue_media')
  Invoke-Compose @('up','-d','--no-build','--no-recreate','--pull','never') 'start HTTPS API and LIVE'
  Set-VenueStep 'verify-first-lan-readiness'
  Wait-VenueLanReady $state
  Set-SetupPhase $state 'READY'
 }
 Set-VenueStep 'verify-lan-readiness'
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
 Ensure-Firewall $state.ip
 Assert-NoOtherVenueGatewayRunning
 Start-VenueDatabase
 if(-not(Test-IsActiveVenueStage $state.stageId)){throw 'Этот этап сохранён в истории. Для выгрузки используйте Экспорт в этой папке.'}
 Repair-VenueCoverageIfNeeded
 Get-Content -LiteralPath (Join-Path $Root 'upgrade-journal-links.sql') -Raw -Encoding UTF8 |
  & docker @(Get-VenueComposeArguments) exec -T db psql -v 'ON_ERROR_STOP=1' -U usd_venue_root -d usd_venue
 Assert-Exit 'upgrade durable amplifier link journal'
 if(-not(Test-IsActiveVenueStage $state.stageId)){throw 'Этот этап сохранён в истории. Для запуска используйте текущий ярлык USD. Для его выгрузки нажмите Экспорт в этой папке.'}
 Assert-VenueVolumeRetained @('venue_media','venue_ca','venue_caddy_config')
 Invoke-Compose @('up','-d','--no-build','--no-recreate','--pull','never') 'start offline without Internet'
 Wait-VenueLanReady $state
 Save-Autostart
 Save-DesktopShortcuts
 try{Export-VenueCA}catch{
  Write-Warning ('Локальный сервер запущен, но сертификат пока не выгружен: '+$_.Exception.Message+'. Нажмите «USD — Сертификат».')
 }
 if(-not $Silent){
  $url='https://'+$state.ip+'/login'
  Write-Host ('ОФЛАЙН USD: '+$url)
  Write-Host ('LIVE без сертификата: http://'+$state.ip+'/venue/live')
  Write-Host 'Телефонам необходимо отдельно доверить локальный CA Caddy.'
  Start-Process $url
  Show-VenueMessage ('USD запущен.'+[Environment]::NewLine+'Вход для судей: '+$url+[Environment]::NewLine+'LIVE без сертификата: http://'+$state.ip+'/venue/live'+[Environment]::NewLine+'Результаты на табло обновляются каждые 4 секунды.'+[Environment]::NewLine+'Для ввода результатов на телефонах пока требуется доверенный HTTPS; табло открывается без установки CA.')
 }
}
function Test-VenueApiReady([string]$ExpectedSha,[string]$ExpectedStage) {
 $prior=$ErrorActionPreference;$ErrorActionPreference='Continue'
 $program=@'
// The script is streamed to node - on stdin; arguments begin at argv[2].
const [sha,stageId]=process.argv.slice(2);
Promise.all([
 fetch("http://127.0.0.1:3000/release",{signal:AbortSignal.timeout(3000)}),
 fetch("http://127.0.0.1:3000/results/venue-live",{signal:AbortSignal.timeout(3000)})
]).then(async ([release,live])=>{
 if(!release.ok||!live.ok)process.exit(2);
 const [releaseInfo,liveInfo]=await Promise.all([release.json(),live.json()]);
 process.exit(releaseInfo.revision===sha && liveInfo.stage?.id===stageId?0:3);
}).catch(()=>process.exit(4));
'@
 try{
  # JS via stdin for PS5.1.
  $program | & docker @(Get-VenueComposeArguments) exec -T api node - $ExpectedSha $ExpectedStage 2>$null | Out-Null
  return ($LASTEXITCODE -eq 0)
 }catch{return $false}
 finally{$ErrorActionPreference=$prior}
}
function Export-VenueReturn {
 param([switch]$LeaveApiStopped,[switch]$Automatic,[switch]$LocalArchive)
 # Export is encrypted; no automatic Ubuntu sync.
 # Never use central secrets or delete local durable records.
 if($Silent){throw 'Экспорт требует присутствия администратора и пароль'}
 Assert-VenueCompose
 $state=Read-State
 if(!$state -or $state.phase -ne 'READY'){throw 'Сначала завершите установку сервера USD'}
 $cfg=Read-Env
 if($cfg['VENUE_STAGE_ID'] -ne $state.stageId -or
  $cfg['VENUE_IMAGE_TAG'] -ne $state.image -or
  $cfg['VENUE_SIGNING_KEY_FINGERPRINT'] -ne $state.fingerprint){
  throw 'Идентификатор этапа или его исходная подпись изменились'
 }
 Ensure-DockerReady
 $directory=Join-Path $PrivateDir 'return-output'
 New-Item -ItemType Directory -Path $directory -Force|Out-Null
 $volume=(Get-VenueProject)+'_venue_return_keys'
 $keyTool=Join-Path $Root 'ensure-return-keys.mjs'
 $keyMounts=@('--volume',($volume+':/app/venue-return-keys:rw'),
  '--volume',($directory+':/app/venue-return-output:rw'),
  '--volume',($keyTool+':/app/ensure-return-keys.mjs:ro'))
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
 Start-VenueDatabase
 $date=[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')
 $filename=('usd-venue-return-'+$state.stageId+'-'+$date+'-'+[guid]::NewGuid().ToString('N').Substring(0,8)+'.json')
 $secret=$null
 if($Automatic){
  if(!(Test-Path -LiteralPath $state.package -PathType Leaf)){throw 'Нет исходного подписанного этапа'}
  $originalStage=Get-Content -LiteralPath $state.package -Raw -Encoding UTF8|ConvertFrom-Json
  $syncToken=[string]$originalStage.snapshot.syncAuthorization.token
  if($originalStage.snapshot.stageId -ne $state.stageId -or
   $syncToken -cnotmatch '^[A-Za-z0-9_-]{43}$' -or
   (-not $LocalArchive -and ([DateTime]$originalStage.snapshot.syncAuthorization.expiresAt).ToUniversalTime() -le [DateTime]::UtcNow)){
   throw 'Пакет не разрешает автоматическую синхронизацию. Загрузите новый подписанный этап.'
  }
  $secret='UsdSync!1-'+$syncToken
 }else{$secret=Read-VenuePassword 'шифрования возвратного файла'}
 $apiRunning=@(& docker @(Get-VenueComposeArguments) ps --status running -q api)
 Assert-Exit 'inspect currently running judge API'
 $apiWasRunning=(@($apiRunning|Where-Object { -not [string]::IsNullOrWhiteSpace($_) }).Count -gt 0) -and (Test-IsActiveVenueStage $state.stageId)
 $apiStopped=$false
 $exportSucceeded=$false
 $returnFile=Join-Path $directory $filename
 try{
  if($apiWasRunning){
   Invoke-Compose @('stop','api') 'pause judging before consistent signed return export'
   $apiStopped=$true
  }
  $args=@(Get-VenueComposeArguments)+@('run','--rm','--no-deps','-T',
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
 if(!$state -or $state.stageId -ne $Bundle.stageId){throw 'Неверный этап для центральной синхронизации'}
 $signed=Get-Content -LiteralPath $state.package -Raw -Encoding UTF8|ConvertFrom-Json
 $token=[string]$signed.snapshot.syncAuthorization.token
 if($token -cnotmatch '^[A-Za-z0-9_-]{43}$' -or
  ([DateTime]$signed.snapshot.syncAuthorization.expiresAt).ToUniversalTime() -le [DateTime]::UtcNow){
  throw 'Право автоматического возврата истекло. Данные ноутбука не удалены.'
 }
 $encrypted=[IO.File]::ReadAllText($Bundle.path).Trim()
 $pem=[IO.File]::ReadAllText($Bundle.publicKey)
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
 if($state -and $state.phase -eq 'READY'){
  if($Silent){throw 'Синхронизация реального этапа требует нажатия администратора'}
  $frozen=$false
  try{
   $bundle=Export-VenueReturn -LeaveApiStopped -Automatic
   $frozen=$true
   $SyncResult=Sync-VenueReturn -Bundle $bundle
   if($SyncResult.accepted -ne $true){throw 'Нет подтверждения ACKNOWLEDGED центрального сервера'}
  }catch{
   if($frozen -and (Test-IsActiveVenueStage $state.stageId)){try{Restore-VenueApi}catch{Write-Host 'Локальная база сохранена. Откройте USD — Офлайн.'}}
   throw
  }
 }
 if($state -and -not(Test-IsActiveVenueStage $state.stageId)){
  Write-Host 'Исторический этап синхронизирован. Текущий локальный этап продолжает работать.'
  return
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
. (Join-Path $Root 'venue-season.ps1')
. (Join-Path $Root 'venue-coverage.ps1')
. (Join-Path $Root 'venue-directory.ps1')
. (Join-Path $Root 'venue-ca.ps1')
. (Join-Path $Root 'venue-update.ps1')
if($MyInvocation.InvocationName -eq '.'){return}
try{
 if(-not $Silent){. (Join-Path $Root 'venue-dialogs.ps1')}
 if($Action -eq 'install'){Install-Local}
 elseif($Action -eq 'offline'){Start-Local}
 elseif($Action -eq 'export'){Export-VenueReturn}
 elseif($Action -eq 'certificate'){Download-VenueCertificate}
 elseif($Action -eq 'next'){Switch-ToNextStage}
 elseif($Action -eq 'directory'){Import-VenueParticipantDirectory}
 else{Return-Online}
}catch{
 Write-Host ('USD VENUE: не удалось выполнить '+$Action+'; step='+$script:VenueStep) -ForegroundColor Red
 if(!$Silent){Write-Host ('Причина: '+$_.Exception.Message)}
 if(!$Silent -and (Get-Command Show-VenueMessage -ErrorAction SilentlyContinue)){
  Show-VenueMessage ('Действие не завершено. Шаг: '+$script:VenueStep+[Environment]::NewLine+$_.Exception.Message+[Environment]::NewLine+'Ничего не удаляйте. Устраните причину и нажмите ту же кнопку снова.')
 }
 Write-Host 'Ничего не удаляйте. После устранения причины повторите тот же запуск.'
 exit 1
}
