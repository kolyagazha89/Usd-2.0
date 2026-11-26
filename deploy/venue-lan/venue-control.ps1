#requires -Version 5.1
<#
 USD venue Windows manager. Signed one-stage install, one-click offline/online.
 No production DB credentials are ever used. Docker Desktop must use Linux.
#>
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][ValidateSet('install','offline','online','export','next','certificate','directory','prepare','status','images')][string]$Action,
 [string]$StageFile='',
 [string]$PublicKeyFile='',
 [string]$StaffKeyFile='',
 [string]$TrustedFingerprint='',
 [string]$Workspace='',
 [switch]$Operator,
 [switch]$Silent
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$Root=$PSScriptRoot
if($Workspace){
 if(($Action -notin @('export','online') -and !($Operator -and $Action -in @('install','prepare','images'))) -or ![IO.Path]::IsPathRooted($Workspace) -or !(Test-Path -LiteralPath (Join-Path $Workspace 'local-private/setup-state.json') -PathType Leaf)){
  throw 'Рабочая папка этапа недоступна.'
 }
 $Root=$Workspace
}
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
 if($LASTEXITCODE -ne 0){
  $failure=[InvalidOperationException]::new('USD VENUE '+$Purpose+' step='+$script:VenueStep+' failed with exit '+$LASTEXITCODE)
  $failure.Data['VenueExitCode']=$LASTEXITCODE
  throw $failure
 }
}
function Invoke-Docker([string[]]$Arguments,[string]$Purpose){
 $prior=$ErrorActionPreference
 try{
  # Compose reports successful pull/create/start progress on native stderr.
  $ErrorActionPreference='Continue'
  & docker @Arguments 2>&1 | ForEach-Object {Write-Host ([string]$_)}
 }catch{
  throw ('USD VENUE '+$Purpose+' step='+$script:VenueStep+': '+$_.Exception.Message)
 }finally{$ErrorActionPreference=$prior}
 Assert-Exit $Purpose
}
function Invoke-Compose([string[]]$Arguments,[string]$Purpose){
 Invoke-Docker ((Get-VenueComposeArguments)+$Arguments) $Purpose
}
function Invoke-VenueJournalSql([string]$File,[string]$Purpose){
 $sql=Get-Content -LiteralPath $File -Raw -Encoding UTF8
 $prior=$ErrorActionPreference
 try{
  $ErrorActionPreference='Continue'
  $sql | & docker @(Get-VenueComposeArguments) exec -T db psql -X -v 'ON_ERROR_STOP=1' -U usd_venue_root -d usd_venue 2>&1 |
   ForEach-Object {Write-Host ([string]$_)}
 }finally{$ErrorActionPreference=$prior}
 Assert-Exit $Purpose
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
 # Publish only after the protected file has been fully written.
 $temp=$Path+'.'+[guid]::NewGuid().ToString('N')+'.tmp'
 try{
  Write-PrivateFile $temp $Value
  [IO.File]::Move($temp,$Path)
 }finally{
  if(Test-Path -LiteralPath $temp -PathType Leaf){Remove-Item -LiteralPath $temp -Force}
 }
}
function Read-State {
 if(!(Test-Path -LiteralPath $StateFile)){return $null}
 $s=Get-Content -LiteralPath $StateFile -Raw -Encoding UTF8|ConvertFrom-Json
 if($s -and $s.PSObject.Properties.Name -contains 'demo' -and $s.demo -eq $true -and $Action -ne 'install'){
  throw 'Старая пробная база больше не поддерживается. Обратитесь к администратору USD, чтобы сохранить данные и подготовить рабочую установку.'
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
function Get-VenueLanProfile([string]$Ip){
 $interface=Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
  Where-Object {$_.IPAddress -eq $Ip -and $_.AddressState -eq 'Preferred'} |
  Select-Object -First 1
 if(!$interface){throw ('У ноутбука больше нет адреса площадки '+$Ip+'. Подключитесь к роутеру соревнований и восстановите этот IP.')}
 $profile=Get-NetConnectionProfile -InterfaceIndex $interface.InterfaceIndex -ErrorAction SilentlyContinue
 if(!$profile){throw 'Windows не определила профиль сети площадки. Переподключитесь к роутеру соревнований.'}
 return $profile
}
function Ensure-Firewall([string]$Ip){
 $profile=Get-VenueLanProfile $Ip
 $approvePrivate=$false
 if([string]$profile.NetworkCategory -ne 'Private'){
  if([string]$profile.NetworkCategory -ne 'Public'){
   throw 'Сеть Windows управляется организацией или имеет неподдерживаемый профиль. Выберите отдельный Wi-Fi роутер судей.'
  }
  $message='Windows считает выбранный Wi-Fi общедоступным. Для доступа телефонов нужен частный профиль сети. Изменить ТОЛЬКО эту сеть на «Частная» и разрешить HTTPS (TCP 443) только своей подсети (вход HTTPS 443 и табло HTTP 80)?'
  Set-VenueStep 'confirm-private-network'
  if(-not(Confirm-VenueAction $message)){
   throw 'Wi-Fi сейчас «Общедоступная». Откройте Параметры Windows -> Сеть и Интернет -> свойства подключённого Wi-Fi -> профиль «Частная» и запустите установку снова.'
  }
  $approvePrivate=$true
 }
 if(!$approvePrivate -and (Test-VenueFirewallRule $Ip)){return}
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
   Set-VenueStep 'confirm-firewall-uac'
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
 $check=Get-VenueLanProfile $Ip
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
 # Remove only superseded USD shortcuts created by older releases; never other links.
 foreach($old in @('USD — Офлайн.lnk','USD — Онлайн.lnk','USD — Экспорт.lnk',
                  'USD — Профили.lnk','USD — Следующий этап.lnk',
                  'USD — Сертификат.lnk','USD — Инструкция.lnk')){
  $path=Join-Path $desktop $old
  if(Test-Path -LiteralPath $path -PathType Leaf){Remove-Item -LiteralPath $path -Force}
 }
 $shell=New-Object -ComObject WScript.Shell
 $shortcut=$shell.CreateShortcut((Join-Path $desktop 'USD — Офлайн-сервер.lnk'))
 $shortcut.TargetPath=(Join-Path $PSHOME 'powershell.exe')
 $shortcut.Arguments='-NoProfile -STA -ExecutionPolicy Bypass -File "'+(Join-Path $Root 'USD-Control.ps1')+'"'+' -HideLauncherConsole'
 $shortcut.WorkingDirectory=$Root
 $shortcut.Description='USD — единое окно управления офлайн-сервером'
 $shortcut.Save()
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
# Store the phase marker before promoting the config. A retry may promote
# only the exact file recorded by CONFIGURED, never regenerate DB credentials.
function Complete-VenueInitialConfig([object]$State) {
 if(Test-Path -LiteralPath $EnvFile){return}
 if($State.phase -ne 'CONFIGURED' -or
    $State.PSObject.Properties.Name -notcontains 'pendingConfig' -or
    $State.PSObject.Properties.Name -notcontains 'pendingConfigHash'){
  throw 'Нет локальной конфигурации. Восстановите .env из резервной копии.'
 }
 if($State.pendingConfig -cnotmatch '^bootstrap-env-[a-f0-9]{32}\.tmp$' -or
    $State.pendingConfigHash -notmatch '^[a-f0-9]{64}$'){
  throw 'Метаданные локальной конфигурации повреждены.'
 }
 $pending=Join-Path $PrivateDir $State.pendingConfig
 if(!(Test-Path -LiteralPath $pending -PathType Leaf) -or
    -not ([IO.File]::GetAccessControl($pending)).AreAccessRulesProtected -or
    (Get-FileHash -LiteralPath $pending -Algorithm SHA256).Hash -ine $State.pendingConfigHash){
  throw 'Подготовленная локальная конфигурация отсутствует или повреждена. Данные сохранены.'
 }
 [IO.File]::Move($pending,$EnvFile)
}
function New-InitialState {
 if($Operator -and (!$StageFile -or !$PublicKeyFile -or !$StaffKeyFile -or !$TrustedFingerprint)){throw 'Подписанный пакет или ключи отсутствуют. Повторите загрузку этапа из окна USD.'}
 if(Test-Path -LiteralPath $EnvFile){throw '.env существует без маркера установки. Нельзя затирать чужую конфигурацию.'}
 $source=$null;$sharedConfig=$null
 $sharedFile=Join-Path $Root 'shared-source.json'
 if(Test-Path -LiteralPath $sharedFile){
  $source=Get-Content -LiteralPath $sharedFile -Raw -Encoding UTF8|ConvertFrom-Json
  $sharedConfig=Read-Env (Join-Path ([string]$source.workspace) '.env')
 }
 $ip=$(if($sharedConfig){$sharedConfig['VENUE_BIND_IP']}else{Get-PrivateLanIp})
 $sha=Get-VenueReleaseSha $sharedConfig
 Set-VenueStep 'read-signed-stage'
 $file='';$key='';$stageId='';$fingerprint=''
 $file=$(if($StageFile){$StageFile}else{Select-VenueFile 'Выберите файл этапа, скачанный из админки USD' 'Файл этапа (*.json)|*.json'})
 if(!(Test-Path -LiteralPath $file -PathType Leaf)){throw 'Файл этапа отсутствует'}
  $payload=Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json
  $trustedSource=$(if($source){Get-Content -LiteralPath (Join-Path ([string]$source.workspace) 'local-private/setup-state.json') -Raw -Encoding UTF8|ConvertFrom-Json}else{$null})
  $reuseTrust=$trustedSource -and (Test-Path -LiteralPath ([string]$trustedSource.publicKey)) -and ([string]$payload.integrity.publicKeyFingerprint -ceq [string]$trustedSource.fingerprint)
  $key=$(if($PublicKeyFile){$PublicKeyFile}elseif($reuseTrust){[string]$trustedSource.publicKey}else{Select-VenueFile 'Выберите открытый ключ из админки USD' 'Открытый ключ (*.pem)|*.pem'})
  $payload=Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json
  $stageId=[string]$payload.snapshot.stageId
  $project=Get-VenueProjectForStage $stageId
  if($source){
   $project=[string]$source.project
   if([string]$source.projectStageId -and $project -cne (Get-VenueProjectForStage $source.projectStageId)){
    throw 'Прежняя база не подтверждена. Подключение нового этапа остановлено.'
   }
   Assert-VenueDatabaseVolumeForProject $project
  }else{Assert-NoOrphanedVenueStack $project}
  # trusted fingerprint verified by admin.
  $fingerprint=$(if($TrustedFingerprint){$TrustedFingerprint}elseif($reuseTrust){[string]$trustedSource.fingerprint}else{(Read-VenueFingerprint).Trim()})
  if($fingerprint -cnotmatch '^[a-f0-9]{64}$'){throw 'Нет независимого доверенного отпечатка Ed25519'}
  if([string]$payload.snapshot.syncAuthorization.token -cnotmatch '^[A-Za-z0-9_-]{43}$'){
   throw 'Скачайте новый подписанный пакет этапа для автоматической синхронизации'
  }
  if([string]$payload.snapshot.staffAccess.algorithm -cne 'AES-256-GCM'){
   throw 'Скачайте новый пакет этапа с существующими аккаунтами судей'
  }
  $keyFile=$(if($StaffKeyFile){$StaffKeyFile}else{Select-VenueFile 'Выберите отдельный ключ входа судей из админки USD' 'Ключ доступа (*.key)|*.key'})
  $keyValue=[IO.File]::ReadAllText($keyFile).Trim()
  if($keyValue -cnotmatch '^[A-Za-z0-9_-]{43}$'){throw 'Неверный файл ключа судей'}
  $privateAccess=Join-Path $PrivateDir 'venue-staff-access.key'
  $privateStage=Join-Path $PrivateDir 'signed-real-stage.json'
  $privatePublicKey=Join-Path $PrivateDir 'venue-signing-public.pem'
  $rawStage=[IO.File]::ReadAllText($file)
  $keyPem=[IO.File]::ReadAllText($key)
  if($Operator -and (Test-Path -LiteralPath $privateStage -PathType Leaf) -and [IO.File]::ReadAllText($privateStage) -cne $rawStage){
   $retained=[IO.File]::ReadAllText($privateStage)|ConvertFrom-Json
   if($retained.snapshot.stageId -cne $stageId -or $retained.integrity.publicKeyFingerprint -cne $fingerprint){
    throw 'Прерванная установка относится к другому этапу или ключу. Данные сохранены.'
   }
   $suffix=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
   $privateStage=Join-Path $PrivateDir ('signed-stage-'+$suffix+'.json')
   $privateAccess=Join-Path $PrivateDir ('staff-access-'+$suffix+'.key')
  }
  Write-VenueImmutableBootstrapFile $privateStage $rawStage
  Write-VenueImmutableBootstrapFile $privateAccess $keyValue
  Write-VenueImmutableBootstrapFile $privatePublicKey $keyPem
  $file=$privateStage
  $fileKey=$privateAccess
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
 $pendingConfig='bootstrap-env-'+[guid]::NewGuid().ToString('N')+'.tmp'
 $pendingPath=Join-Path $PrivateDir $pendingConfig
 Write-PrivateFile $pendingPath ($text+[Environment]::NewLine)
 $state=[pscustomobject]@{
  format=1;phase='CONFIGURED';stageId=$stageId;fingerprint=$fingerprint
  ip=$ip;image=$sha;package=$file;publicKey=$key;accessKey=$fileKey
  project=$project;home=(Get-VenueHome);shared=($null -ne $source)
  pendingConfig=$pendingConfig;pendingConfigHash=(Get-FileHash -LiteralPath $pendingPath -Algorithm SHA256).Hash
  projectStageId=$(if($source){[string]$source.projectStageId}else{$stageId})
 }
 Set-SetupPhase $state 'CONFIGURED'
 Complete-VenueInitialConfig $state
 return $state
}
function Get-VenueStageMounts([object]$State){
 return @('--volume',($State.package+':/app/venue-stage.json:ro'),
  '--volume',($State.publicKey+':/app/venue-signing-public.pem:ro'),
  '--volume',((Join-Path $Root 'verify-stage-package.mjs')+':/app/verify-stage-package.mjs:ro'),
  '--volume',((Join-Path $Root 'import-stage.mjs')+':/app/import-stage.mjs:ro'))
}
function Invoke-VenueStageCheck([array]$Mounts,[string]$Mode){
 try{
  Invoke-Compose (@('run','--rm','--no-deps')+$Mounts+
   @('--entrypoint','node','api','/app/import-stage.mjs',
   '/app/venue-stage.json','/app/venue-signing-public.pem',$Mode)) 'verify stage signature or exact installed receipt'
 }catch{
  switch($_.Exception.Data['VenueExitCode']){
   20 {Write-Host 'Срок пакета по часам Docker истёк. Проверьте время Windows и Docker Desktop.'}
   21 {throw 'По часам Docker пакет ещё не действует. Проверьте дату и время Windows, затем перезапустите Docker Desktop.'}
   22 {throw 'У подписанного пакета неверный срок действия. Скачайте новый пакет этапа из админки USD.'}
  }
  throw
 }
}
function Confirm-SignedStage([object]$State) {
 $config=Read-Env
 if($config['VENUE_STAGE_ID'] -ne $State.stageId -or
  $config['VENUE_SIGNING_KEY_FINGERPRINT'] -ne $State.fingerprint -or
  $config['VENUE_BIND_IP'] -ne $State.ip){throw 'Подменён этап или доверенный ключ'}
 if(!(Test-Path -LiteralPath $State.package) -or !(Test-Path -LiteralPath $State.publicKey)){
  throw 'Пакет этапа или доверенный открытый ключ больше не доступны'
 }
 $mounts=Get-VenueStageMounts $State
 $preImport=[array]::IndexOf($Phases,[string]$State.phase) -lt [array]::IndexOf($Phases,'IMPORTED')
 $verificationMode=$(if($preImport){'--dry-run'}else{'--check-installed'})
 try{
  Invoke-VenueStageCheck $mounts $verificationMode
 }catch{
  if(!$preImport -or $_.Exception.Data['VenueExitCode'] -ne 20){throw}
  if($State.phase -eq 'SCHEMA_READY'){
   try{
    Invoke-VenueStageCheck $mounts '--check-uninstalled'
   }catch{
    if($_.Exception.Data['VenueExitCode'] -ne 23){throw}
    # Import can commit immediately before Windows persists IMPORTED.
    # Recover only the exact package already recorded by the database.
    Invoke-VenueStageCheck $mounts '--check-installed'
    Create-ExistingStaff $State $mounts -CheckOnly
    Set-SetupPhase $State 'IMPORTED'
    return $mounts
   }
  }
  return (Update-ExpiredVenueSetupPackage $State)
 }
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
  throw 'Найдена старая пробная база USD. Обратитесь к администратору USD для переноса на рабочий сервер. Данные сохранены.'
 }
 if(!$state){
  Set-VenueStep 'select-signed-stage-and-verify-release'
  $state=New-InitialState
 }else{
  Complete-VenueInitialConfig $state
 }
 $cfg=Read-Env
 if($cfg['VENUE_STAGE_ID'] -ne $state.stageId -or $cfg['VENUE_IMAGE_TAG'] -ne $state.image){
  throw 'Конфигурация этапа не совпадает с установкой'
 }
 Set-VenueStep 'configure-firewall'
 Ensure-Firewall $state.ip
 Set-VenueStep 'validate-compose'
 Invoke-Compose @('config','--quiet') 'Docker Compose validation'
 if($state.phase -eq 'READY'){
  if($Operator){
   Set-VenueStep 'start-local-database'
   Start-VenueDatabase
   if(-not(Test-IsActiveVenueStage $state.stageId)){throw 'Этот этап находится в архиве. Откройте ярлык с текущим этапом.'}
  }
  Start-Local -ActivateCachedFrontend
  return
 }
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
  if($state.PSObject.Properties.Name -contains 'shared' -and $state.shared){
   Assert-VenueDatabaseVolume
   Assert-VenueVolumeRetained @('venue_media','venue_ca','venue_caddy_config')
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
  Invoke-VenueJournalSql (Join-Path $Root $journalFile) 'append-only journal'
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
  if($state.PSObject.Properties.Name -contains 'shared' -and $state.shared){
   Start-VenueStageServices $state
  }else{
   Assert-VenueVolumeRetained @('venue_media')
   Invoke-Compose @('up','-d','--no-build','--no-recreate','--pull','never') 'start HTTPS API and LIVE'
  }
  Set-VenueStep 'verify-first-lan-readiness'
  Wait-VenueLanReady $state
  Set-SetupPhase $state 'READY'
 }
 Set-VenueStep 'verify-lan-readiness'
 Start-Local
}
function Start-Local {
 param([switch]$ActivateCachedFrontend)
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
 Set-VenueStep 'start-local-database'
 Start-VenueDatabase
 if(-not(Test-IsActiveVenueStage $state.stageId)){throw 'Этот этап сохранён в истории. Для выгрузки используйте Экспорт в этой папке.'}
 $startupTarget=if($ActivateCachedFrontend){Get-VenueStartupTargetForStoppedStage $state}
 Repair-VenueCoverageIfNeeded
 Invoke-VenueJournalSql (Join-Path $Root 'upgrade-journal-links.sql') 'upgrade durable amplifier link journal'
 if(-not(Test-IsActiveVenueStage $state.stageId)){throw 'Этот этап сохранён в истории. Для запуска используйте текущий ярлык USD. Для его выгрузки нажмите Экспорт в этой папке.'}
 Assert-VenueVolumeRetained @('venue_media','venue_ca','venue_caddy_config')
 Set-VenueStep 'start-local-services'
 Invoke-Compose @('up','-d','--no-build','--no-recreate','--pull','never') 'start offline without Internet'
 Set-VenueStep 'verify-lan-readiness'
 Wait-VenueLanReady $state
 Invoke-VenueStartupActivation $state $startupTarget
 Save-Autostart
 Save-DesktopShortcuts
 if(-not $Silent -and -not $Operator){
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
 const releaseMatches=releaseInfo.revision===sha;
 if(!releaseMatches)process.exit(5);
 process.exit(liveInfo.stage?.id===stageId?0:3);
}).catch(()=>process.exit(4));
'@
 try{
  # JS via stdin for PS5.1.
  $program | & docker @(Get-VenueComposeArguments) exec -T api node - $ExpectedSha $ExpectedStage 2>$null | Out-Null
  $result=$LASTEXITCODE
  $script:VenueApiProbeReason=switch($result){
   2 {'Локальный API запустился, но endpoint этапа вернул ошибку.'}
   3 {'Локальный API сообщает другой ID активного этапа.'}
   5 {'Локальный API сообщает другую версию программы.'}
   default {'Локальный API не отвечает.'}
  }
  return ($result -eq 0)
 }catch{return $false}
 finally{$ErrorActionPreference=$prior}
}
function Export-VenueReturn {
 param([switch]$LeaveApiStopped,[switch]$Automatic,[switch]$LocalArchive)
 # Never use central secrets or delete local durable records.
 Set-VenueStep 'prepare-return-backup'
 if($Silent){throw 'Экспорт требует присутствия администратора'}
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
 $keyTool=Join-Path $PSScriptRoot 'ensure-return-keys.mjs'
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
 # One stage-scoped high-entropy encryption secret, provided by the signed stage.
 # No human-generated password is required for manual backups or online sync.
 # The key is never printed or passed via Docker arguments; only via stdin.
 if(!(Test-Path -LiteralPath $state.package -PathType Leaf)){throw 'Нет исходного подписанного этапа'}
 $originalStage=Get-Content -LiteralPath $state.package -Raw -Encoding UTF8|ConvertFrom-Json
 $syncToken=[string]$originalStage.snapshot.syncAuthorization.token
 if($originalStage.snapshot.stageId -ne $state.stageId -or
  $syncToken -cnotmatch '^[A-Za-z0-9_-]{43}$'){
  throw 'Не найден действительный исходный ключ шифрования этапа. Данные ноутбука сохранены.'
 }
 $syncExpires=([DateTime]$originalStage.snapshot.syncAuthorization.expiresAt).ToUniversalTime()
 if($Automatic -and -not $LocalArchive -and $syncExpires -le [DateTime]::UtcNow){
  throw 'Право автоматической синхронизации истекло. Данные сохранены. Обновите подписанный пакет этапа.'
 }
 if(-not $Automatic -and $syncExpires -le [DateTime]::UtcNow){
  Write-Warning 'Срок автоматической отправки истёк, но защищённый локальный экспорт создаётся.'
 }
 $secret='UsdSync!1-'+$syncToken
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
   '--volume',((Join-Path $PSScriptRoot 'import-stage.mjs')+':/app/import-stage.mjs:ro'),
   '--volume',((Join-Path $PSScriptRoot 'verify-stage-package.mjs')+':/app/verify-stage-package.mjs:ro'),
   '--volume',((Join-Path $PSScriptRoot 'venue-return-package.mjs')+':/app/venue-return-package.mjs:ro'),
   '--volume',((Join-Path $PSScriptRoot 'export-venue-return.mjs')+':/app/export-venue-return.mjs:ro'),
   '--entrypoint','node','api','/app/export-venue-return.mjs',
   '/app/venue-return-keys/venue-return-private.pem',
   ('/app/venue-return-output/'+$filename))
  # Password is sent over stdin ONLY, never exposed in arguments or logs.
  Set-VenueStep 'write-return-backup'
  $prior=$ErrorActionPreference
  try{
   $ErrorActionPreference='Continue'
   $output=@($secret | & docker @args 2>&1 | ForEach-Object {
    if($_ -is [Management.Automation.ErrorRecord]){Write-Host ([string]$_)}else{$_}
   })
  }finally{$ErrorActionPreference=$prior}
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
   Restore-VenueApi
  }
 }
 if($Automatic){
  return [pscustomobject]@{
   path=$returnFile;publicKey=$publicKey;stageId=$state.stageId
   journalEndHash=[string]$summary.journalEndHash;apiPaused=$apiStopped
  }
 }
 Write-Host ('ЗАШИФРОВАННЫЙ ФАЙЛ: '+$returnFile)
 Write-Host ('ОТКРЫТЫЙ КЛЮЧ: '+$publicKey)
 Write-Host ('ОТПЕЧАТОК КЛЮЧА: '+$fingerprint)
 Write-Host 'ЭТО НЕ СИНХРОНИЗАЦИЯ. Данные останутся на ноутбуке до подтверждения Ubuntu.'
 if($Operator){return}
 Show-VenueMessage ('Возвратный файл создан.'+[Environment]::NewLine+
  'Папка: '+$directory+[Environment]::NewLine+
  'Передайте шифрованный файл ответственному администратору USD.'+[Environment]::NewLine+
  'Открытый ключ и его отпечаток сверяются отдельно.'+[Environment]::NewLine+
  'Пароль создавать не нужно: шифрование выполнено автоматически. Синхронизация НЕ завершена.'+[Environment]::NewLine+
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
 $SyncResult=Send-VenueSyncPackage $body $token
 Assert-VenueSyncAck $SyncResult $Bundle
 $ack=Join-Path $PrivateDir ('sync-ack-'+$Bundle.journalEndHash+'.json')
 if(!(Test-Path -LiteralPath $ack)){
  Write-PrivateFile $ack ((@{accepted=$true;stageId=$Bundle.stageId;journalEndHash=$Bundle.journalEndHash;at=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json -Compress)+[Environment]::NewLine)
 }
 return $SyncResult
}
function Restore-VenueApi {
 Invoke-Compose @('up','-d','--no-deps','--no-build','--pull','never','api') 'restore local judging without touching storage'
}
function Return-Online {
 $state=Read-State
 if(!($state -and $state.phase -eq 'READY')){throw 'Сначала завершите установку этапа. Отправка не выполнялась.'}
 if($state -and $state.phase -eq 'READY'){
  if($Silent){throw 'Синхронизация реального этапа требует нажатия администратора'}
  $frozen=$false
  try{
   $bundle=Export-VenueReturn -LeaveApiStopped -Automatic
   $frozen=$bundle.apiPaused
   Set-VenueStep 'send-return-to-usd'
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
   Set-VenueStep 'stop-after-ack'
   Invoke-Compose @('stop','api','frontend','gateway','rustfs') 'stop after central ACK without deleting local DB'
  }
 }
 Write-Host 'USD ONLINE. Synchronization ACKNOWLEDGED. Local backup preserved.'
 if(-not $Silent -and -not $Operator){Start-Process $OnlineUrl}
}
. (Join-Path $PSScriptRoot 'venue-season.ps1')
. (Join-Path $PSScriptRoot 'venue-coverage.ps1')
. (Join-Path $PSScriptRoot 'venue-directory.ps1')
. (Join-Path $PSScriptRoot 'venue-ca.ps1')
. (Join-Path $PSScriptRoot 'venue-update.ps1')
. (Join-Path $PSScriptRoot 'venue-operator-status.ps1')
. (Join-Path $PSScriptRoot 'venue-sync-http.ps1')
if($MyInvocation.InvocationName -eq '.'){return}
if($Operator){
 [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
 [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
}
$mutex=$null
$ownsMutex=$false
try{
 if($Action -eq 'status'){
  Write-Output ('USD STATUS: '+((Get-VenueOperatorStatus)|ConvertTo-Json -Compress))
  return
 }
 if($Action -eq 'images'){Invoke-VenueStartupImageCache;return}
 $mutex=[Threading.Mutex]::new($false,'Local\USD-Venue-Operation')
 try{$ownsMutex=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$ownsMutex=$true}
 if(!$ownsMutex){throw 'Другая операция USD уже выполняется. Дождитесь её завершения.'}
 if(-not $Silent){. (Join-Path $PSScriptRoot 'venue-dialogs.ps1')}
 if($Action -eq 'install'){
  if($Workspace){Copy-VenueProgramFiles $PSScriptRoot $Root}
  Install-Local
 }
 elseif($Action -eq 'offline'){Start-Local -ActivateCachedFrontend}
 elseif($Action -eq 'export'){Export-VenueReturn}
 elseif($Action -eq 'certificate'){Download-VenueCertificate}
 elseif($Action -eq 'next'){Switch-ToNextStage}
 elseif($Action -eq 'directory'){Import-VenueParticipantDirectory}
 elseif($Action -eq 'prepare'){Import-VenueParticipantDirectory -PrepareRoster;Start-Local -ActivateCachedFrontend}
 else{Return-Online}
}catch{
 Write-Host ('USD VENUE: не удалось выполнить '+$Action+'; step='+$script:VenueStep) -ForegroundColor Red
 if(!$Silent){Write-Host ('USD VENUE ERROR: '+$_.Exception.Message)}
 if(!$Silent -and !$Operator -and (Get-Command Show-VenueMessage -ErrorAction SilentlyContinue)){
  Show-VenueMessage ('Действие не завершено. Шаг: '+$script:VenueStep+[Environment]::NewLine+$_.Exception.Message+[Environment]::NewLine+'Ничего не удаляйте. Устраните причину и нажмите ту же кнопку снова.')
 }
 exit 1
}finally{
 if($ownsMutex){$mutex.ReleaseMutex()}
 if($null -ne $mutex){$mutex.Dispose()}
}
