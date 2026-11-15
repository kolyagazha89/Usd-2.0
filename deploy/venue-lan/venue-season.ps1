#requires -Version 5.1
# USD seasons: retain stages in one existing Docker project and database.
# This module is dot-sourced by venue-control.ps1.

function Get-VenueProjectForStage([string]$StageId){
 if($StageId -cnotmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'){
  throw 'Недействительный UUID этапа'
 }
 return 'usd-venue-'+$StageId.Replace('-','').ToLowerInvariant()
}
function Get-VenueProject {
 $state=Read-State
 if(!$state -or $state.PSObject.Properties.Name -notcontains 'project'){return 'usd-venue'}
 $projectStage=$(if($state.PSObject.Properties.Name -contains 'projectStageId'){[string]$state.projectStageId}else{[string]$state.stageId})
 $expected=Get-VenueProjectForStage $projectStage
 if([string]$state.project -ceq 'usd-venue'){return 'usd-venue'}
 if([string]$state.project -cne $expected){throw 'Docker-проект не совпадает с закреплённым этапом'}
 return $expected
}
function Get-VenueHome {
 $state=Read-State
 if($state -and $state.PSObject.Properties.Name -contains 'home'){
  $venueBase=[string]$state.home
  if(![IO.Path]::IsPathRooted($venueBase) -or !(Test-Path -LiteralPath $venueBase -PathType Container)){
   throw 'Исходная папка USD не найдена. Данные не изменены.'
  }
  return $venueBase
 }
 $parent=Split-Path -Path $Root -Parent
 if((Split-Path -Path $parent -Leaf) -eq 'stage-workspaces'){
  return (Split-Path -Path $parent -Parent)
 }
 return $Root
}
function Assert-NoOtherVenueGatewayRunning {
 $expected=Get-VenueProject
 $projects=@(& docker ps --filter 'label=com.docker.compose.service=gateway' --format '{{.Label "com.docker.compose.project"}}')
 Assert-Exit 'inspect other local USD stages'
 foreach($project in $projects){
  if($project -like 'usd-venue*' -and $project -cne $expected){
   throw ('Уже работает другой этап '+$project+'. Остановите его через «USD — Онлайн», не смешивайте подключения судей.')
  }
 }
}
function Test-VerifiedVenueAck([string]$StageId){
 # Call only with the judging API frozen. The acknowledgement is valid only
 # for the *current* immutable journal tip, including an empty journal.
 $null=Get-VenueProjectForStage $StageId
 $sql="SELECT COALESCE((SELECT hash FROM venue_private.operation_journal WHERE stage_id='$StageId' ORDER BY sequence DESC LIMIT 1), repeat('0',64));"
 $project=Get-VenueProject
 $rows=@(& docker @(Get-VenueComposeArguments) exec -T db psql -X -A -t -v 'ON_ERROR_STOP=1' -U usd_venue_root -d usd_venue -c $sql)
 Assert-Exit 'inspect last local journal hash'
 $hash=@($rows | Where-Object {$_ -match '^[a-f0-9]{64}$'} | Select-Object -Last 1)
 if($hash.Count -ne 1){throw 'Текущий хеш журнала не подтверждён'}
 $ackPath=Join-Path $PrivateDir ('sync-ack-'+$hash[0]+'.json')
 if(!(Test-Path -LiteralPath $ackPath -PathType Leaf)){return $false}
 $ack=Get-Content -LiteralPath $ackPath -Raw -Encoding UTF8 | ConvertFrom-Json
 return ($ack.accepted -eq $true -and [string]$ack.stageId -ceq $StageId -and
  [string]$ack.journalEndHash -ceq [string]$hash[0])
}
function Get-VenueKitFiles {
 return @(
  'USD-Install.cmd','USD-Next-Stage.cmd','USD-Offline.cmd','USD-Online.cmd',
  'USD-Export.cmd','venue-control.ps1','venue-season.ps1',
  'venue-dialogs.ps1','venue-firewall.ps1','ensure-return-keys.mjs',
  'compose.yaml','Caddyfile','config/venue-config.js',
  'initdb/010-venue-api-role.sh','INSTRUCTION.html',
  'import-stage.mjs','verify-stage-package.mjs','provision-rustfs.mjs',
  'venue-judge-permissions.mjs','provision-existing-staff.mjs',
  'install-journal.sql','upgrade-journal-links.sql',
  'export-venue-return.mjs','venue-return-package.mjs','verify-venue-return.mjs',
  'preview-venue-reconciliation.mjs','preview-venue-reconciliation-cli.mjs'
 )
}
function New-VenueStageWorkspace([string]$StageId){
 $venueBase=Get-VenueHome
 $target=Join-Path (Join-Path $venueBase 'stage-workspaces') $StageId
 $files=@(Get-VenueKitFiles)
 foreach($file in $files){
  if(!(Test-Path -LiteralPath (Join-Path $Root $file) -PathType Leaf)){
   throw ('Обновите установщик: отсутствует '+$file)
  }
 }
 if(Test-Path -LiteralPath $target){
  if(!(Test-Path -LiteralPath $target -PathType Container)){
   throw 'Папка нового этапа не является каталогом. Ничего не изменено.'
  }
  $statePath=Join-Path $target 'local-private/setup-state.json'
  if(Test-Path -LiteralPath $statePath -PathType Leaf){
   $old=Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
   if([string]$old.stageId -cne $StageId -or [string]$old.phase -eq 'READY'){
    throw 'Выбранный этап уже установлен или папка занята. Старые данные сохранены.'
   }
  }
 }else{New-Item -ItemType Directory -Path $target -Force|Out-Null}
 foreach($relative in $files){
  $destination=Join-Path $target $relative
  $dir=Split-Path -Path $destination -Parent
  if(!(Test-Path -LiteralPath $dir)){New-Item -ItemType Directory -Path $dir -Force|Out-Null}
  # NEVER copy .env, local-private, passwords or a previous stage database.
  Copy-Item -LiteralPath (Join-Path $Root $relative) -Destination $destination -Force
 }
 $state=Read-State
 $projectStage=$(if($state.PSObject.Properties.Name -contains 'projectStageId'){[string]$state.projectStageId}else{[string]$state.stageId})
 $source=@{workspace=$Root;project=(Get-VenueProject);projectStageId=$projectStage}
 [IO.File]::WriteAllText((Join-Path $target 'shared-source.json'),($source|ConvertTo-Json),(New-Object Text.UTF8Encoding($false)))
 return $target
}
function Test-IsActiveVenueStage([string]$StageId){
 $rows=@(& docker @(Get-VenueComposeArguments) exec -T db psql -X -A -t -v 'ON_ERROR_STOP=1' -U usd_venue_root -d usd_venue -c 'SELECT stage_id FROM venue_private.active_stage WHERE singleton=true;')
 Assert-Exit 'inspect active stage'
 return @($rows|Where-Object {$_ -ceq $StageId}).Count -eq 1
}
function Switch-ToNextStage {
 if($Silent){throw 'Переключение этапа требует администратора'}
 Assert-VenueCompose
 Ensure-DockerReady
 $old=Read-State
 if(!$old -or $old.phase -ne 'READY'){throw 'Сначала установите и завершите текущий этап'}
 $cfg=Read-Env
 if($cfg['VENUE_STAGE_ID'] -cne [string]$old.stageId -or
  $cfg['VENUE_SIGNING_KEY_FINGERPRINT'] -cne [string]$old.fingerprint){
  throw 'Исходный этап или ключ были изменены. Ничего не изменено.'
 }
 $newFile=Select-VenueFile 'Новый подписанный этап из админки USD' 'Этап (*.json)|*.json'
 $signed=Get-Content -LiteralPath $newFile -Raw -Encoding UTF8 | ConvertFrom-Json
 $newId=[string]$signed.snapshot.stageId
 $null=Get-VenueProjectForStage $newId
 if($newId -ceq [string]$old.stageId){throw 'Выбран прежний этап, нужен другой'}
 try{
  if(([DateTime]$signed.snapshot.expiresAt).ToUniversalTime() -le [DateTime]::UtcNow){throw 'expired'}
 }catch{throw 'Скачайте новый действующий пакет этапа из админки USD'}
 foreach($file in @(Get-VenueKitFiles)){
  if(!(Test-Path -LiteralPath (Join-Path $Root $file) -PathType Leaf)){
   throw 'Сначала обновите Windows-установщик USD.'
  }
 }
 $target=Join-Path (Join-Path (Get-VenueHome) 'stage-workspaces') $newId
 if(Test-Path -LiteralPath (Join-Path $target 'local-private/setup-state.json')){
  $prior=Get-Content -LiteralPath (Join-Path $target 'local-private/setup-state.json') -Raw -Encoding UTF8|ConvertFrom-Json
  if($prior.stageId -cne $newId -or $prior.phase -eq 'READY'){
   throw 'Этап уже установлен. Повторный импорт запрещён.'
  }
 }
 # Prepare the workspace before pausing judges. No network sync gate:
 # a local encrypted snapshot and the original database both remain available.
 $workspace=New-VenueStageWorkspace $newId
 Start-VenueDatabase
 Get-Content -LiteralPath (Join-Path $Root 'upgrade-journal-links.sql') -Raw -Encoding UTF8 |
  & docker @(Get-VenueComposeArguments) exec -T db psql -v 'ON_ERROR_STOP=1' -U usd_venue_root -d usd_venue
 Assert-Exit 'prepare per-stage journal'
 if(-not(Test-IsActiveVenueStage $old.stageId)){throw 'Запустите «Следующий этап» из текущей рабочей папки USD'}
 $wasRunning=Test-VenueJudgingRunning
 try{
  $archive=Export-VenueReturn -LeaveApiStopped -Automatic -LocalArchive
  Write-Host 'Резервный файл текущего этапа сохранён. Отправить его можно позже.'
  Invoke-Compose @('stop') 'pause shared server without deleting any data'
  Write-Host ('НОВАЯ ПАПКА: '+$workspace)
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $workspace 'venue-control.ps1') -Action install -StageFile $newFile | Out-Host
  Assert-Exit 'append next signed stage to shared database'
 }catch{
  # If the import committed, it is resumable from the new workspace; starting
  # an old API against that active stage is refused rather than mixing events.
  try{
   Start-VenueDatabase
   if((Test-IsActiveVenueStage $old.stageId) -and $wasRunning){Restore-VenueStack}
  }catch{Write-Host 'База сохранена.'}
  Write-Host ('Для продолжения установки откройте USD-Install.cmd в '+$workspace)
  throw
 }
}

function Import-SharedVenueStage([object]$state,[hashtable]$cfg,[array]$mounts){
   # Preserve DB credentials on Windows; the root connection exists only in
   # this short-lived importer, never in the long-running judging API.
   $priorDb=$env:DATABASE_URL;$priorPass=$env:VENUE_DB_PASSWORD
   $env:VENUE_DB_PASSWORD=$cfg['VENUE_DB_ROOT_PASSWORD']
   $env:DATABASE_URL='postgresql://usd_venue_root:'+$cfg['VENUE_DB_ROOT_PASSWORD']+'@db:5432/usd_venue?schema=public'
   try{
    Invoke-Compose (@('run','--rm','--no-deps','-e','DATABASE_URL',
      '-e','VENUE_DB_USER=usd_venue_root','-e','VENUE_DB_PASSWORD',
      '-e','VENUE_SHARED_IMPORT=true')+$mounts+
     @(      '--entrypoint','node','api','/app/import-stage.mjs',
      '/app/venue-stage.json','/app/venue-signing-public.pem','--apply',$state.stageId)) 'append signed stage to retained local database'
   }finally{if($null -eq $priorPass){Remove-Item Env:\VENUE_DB_PASSWORD -ErrorAction SilentlyContinue}else{$env:VENUE_DB_PASSWORD=$priorPass};if($null -eq $priorDb){Remove-Item Env:\DATABASE_URL -ErrorAction SilentlyContinue}else{$env:DATABASE_URL=$priorDb}}
}

function Create-ExistingStaff([object]$State,[array]$Mounts,[switch]$CheckOnly){
 if([string]::IsNullOrWhiteSpace([string]$State.accessKey) -or
  !(Test-Path -LiteralPath $State.accessKey -PathType Leaf)){
  throw 'Для настоящего этапа требуется отдельный ключ существующих аккаунтов USD'
 }
 $staffMounts=@('--volume',($State.accessKey+':/app/venue-access-key.txt:ro'),
  '--volume',((Join-Path $Root 'venue-judge-permissions.mjs')+':/app/venue-judge-permissions.mjs:ro'),
  '--volume',((Join-Path $Root 'provision-existing-staff.mjs')+':/app/provision-existing-staff.mjs:ro'))
 $checkArgs=$(if($CheckOnly){@('--check')}else{@()})
 $seasonArgs=@();if($State.PSObject.Properties.Name -contains 'shared' -and $State.shared){$seasonArgs=@('-e','VENUE_RETAINED_SEASON=true')}
 Invoke-Compose (@('run','--rm','--no-deps')+$seasonArgs+$Mounts+$staffMounts+
  @('--entrypoint','node','api','/app/provision-existing-staff.mjs',
  '/app/venue-stage.json','/app/venue-signing-public.pem','/app/venue-access-key.txt')+$checkArgs) 'verify or restore centrally approved staff logins'
}

function Assert-NoOrphanedVenueStack([string]$Project){
 if($Project -cnotmatch '^usd-venue-[0-9a-f]{32}$'){throw 'Неверный Docker-проект нового этапа'}
 $services=@(& docker ps -a --filter ('label=com.docker.compose.project='+$Project) --format '{{.ID}}')
 Assert-Exit 'inspect existing venue containers'
 $volumes=@(& docker volume ls --filter ('label=com.docker.compose.project='+$Project) --format '{{.Name}}')
 Assert-Exit 'inspect existing venue volumes'
 if($services.Count -gt 0 -or $volumes.Count -gt 0){
  throw 'USD уже установлен в другой папке. Не создавайте второй сервер на тех же Docker-томах. Обновите файлы программы в прежней папке, сохранив .env и local-private, затем запустите USD-Install.cmd.'
 }
}
# One-time replacement of an explicitly retired trial; no trial mode remains.

function Get-VenueComposeArguments {
 return @('compose','--project-directory',$Root,'--env-file',$EnvFile,
  '-p',(Get-VenueProject),'-f',(Join-Path $Root 'compose.yaml'))
}
function Start-VenueDatabase {
 Invoke-Compose @('start','--wait','db') 'start existing database without reconfiguration'
}
function Test-VenueJudgingRunning {
 $rows=@(& docker @(Get-VenueComposeArguments) ps --status running -q api)
 Assert-Exit 'inspect previous judging state'
 return @($rows|Where-Object {$_}).Count -gt 0
}
function Restore-VenueStack {
 Invoke-Compose @('start','--wait') 'restore all previously installed services after cancelled stage switch'
}
function Confirm-VenueStaffKey([object]$State,[array]$Mounts){
 try{Create-ExistingStaff $State $Mounts -CheckOnly;return}catch{
  if($Silent){throw}
  Write-Host 'Ключ судей не подходит. Выберите ключ .key именно этого этапа.'
  $replacement=Select-VenueFile 'Ключ судей выбранного этапа' 'Ключ доступа (*.key)|*.key'
  $value=[IO.File]::ReadAllText($replacement).Trim()
  if($value -cnotmatch '^[A-Za-z0-9_-]{43}$'){throw 'Неверный формат ключа судей'}
  $temp=Join-Path $PrivateDir ('staff-key-'+[guid]::NewGuid().ToString('N')+'.tmp')
  Write-PrivateFile $temp $value
  Move-Item -LiteralPath $temp -Destination $State.accessKey -Force
  Create-ExistingStaff $State $Mounts -CheckOnly
 }
}

function Get-VenueReleaseSha([object]$sharedConfig){
 $sha=$null
 if($sharedConfig){
  try{Assert-VenueReleaseImages $sharedConfig['VENUE_IMAGE_TAG'];$sha=$sharedConfig['VENUE_IMAGE_TAG']}catch{}
 }
 if(!$sha){
  $release=Invoke-RestMethod -Uri 'https://api.usd-russia.ru/release' -TimeoutSec 20
  $sha=[string]$release.revision
  if($sha -cnotmatch '^[a-f0-9]{40}$'){throw 'Нет проверенного SHA онлайн-релиза'}
  Invoke-Docker @('pull',('ghcr.io/kolyagazha89/usd-2.0-api:'+$sha)) 'API image pull'
  Invoke-Docker @('pull',('ghcr.io/kolyagazha89/usd-2.0-frontend:'+$sha)) 'frontend image pull'
  Assert-VenueReleaseImages $sha
 }
 return $sha
}
