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
 # A stopped gateway may leave the previous stage's RustFS binding port 19000.
 foreach($service in @('gateway','rustfs')){
  $containers=@(& docker ps --filter ('label=com.docker.compose.service='+$service) --format '{{.ID}}')
  Assert-Exit 'inspect other local USD stages'
  foreach($id in $containers){
   if([string]$id -cnotmatch '^[a-f0-9]{12,64}$'){throw 'Docker вернул неверный ID локального сервиса'}
   $labels=Read-VenueDockerLabels 'container' ([string]$id)
   if([string]$labels.'com.docker.compose.service' -cne $service){
    throw 'У сервиса Docker неверная метка'
   }
   $project=[string]$labels.'com.docker.compose.project'
   if($project -like 'usd-venue*' -and $project -cne $expected){
    throw ('Уже запущен другой офлайн-этап '+$project+'. Остановите его через USD — Онлайн; данные остаются на ноутбуке.')
   }
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
# Docker Desktop named volumes may be root-owned; RustFS runs as uid 10001.
# Only touch the top directory of this one owned venue media volume.
function Initialize-VenueMediaVolume {
 $project=Get-VenueProject
 if($project -cnotmatch '^usd-venue-[0-9a-f]{32}$'){
  throw 'Неизвестный проект площадки. Права RustFS не изменены.'
 }
 $volume=$project+'_venue_media'
 Invoke-Compose @('stop','rustfs') 'stop this stage RustFS before volume permissions'
 Invoke-Compose @('create','--no-recreate','rustfs') 'prepare own media volume'
 $rows=@(& docker volume inspect --format '{{json .Labels}}' $volume 2>$null)
 Assert-Exit 'inspect owned media volume'
 if($rows.Count -ne 1){throw 'Docker не подтвердил единственный том RustFS'}
 try{$labels=ConvertFrom-Json -InputObject ([string]$rows[0]) -ErrorAction Stop}
 catch{throw 'Не удалось проверить метки тома RustFS'}
 if($null -eq $labels -or
    [string]$labels.'com.docker.compose.project' -cne $project -or
    [string]$labels.'com.docker.compose.volume' -cne 'venue_media'){
  throw 'Том RustFS не принадлежит выбранному этапу. Данные не изменены.'
 }
 # Reuse cached PostgreSQL Alpine shell; no network, deletion or extra image.
 $fix='set -eu; test $(stat -c %u:%g /data) = 10001:10001 || chown 10001:10001 /data; test $(stat -c %u:%g /data) = 10001:10001'
 Invoke-Docker @('run','--rm','--network','none','--user','0:0',
  '--mount',('type=volume,source='+$volume+',target=/data'),
  '--entrypoint','sh','postgres:18-alpine','-ec',$fix) 'prepare isolated RustFS volume for uid 10001'
}
function Get-VenueKitFiles {
 return @(
  'USD-Install.cmd','USD-Next-Stage.cmd','USD-Offline.cmd','USD-Online.cmd',
  'USD-Export.cmd','USD-Certificate.cmd','USD-Participants.cmd','USD-Control.cmd','USD-Control.ps1','venue-control.ps1','venue-season.ps1','venue-ca.ps1','venue-update.ps1',
  'venue-operator.xaml','venue-operator-status.ps1','venue-dialogs.ps1','venue-firewall.ps1','venue-coverage.ps1','venue-directory.ps1','ensure-return-keys.mjs',
  'compose.yaml','Caddyfile','config/venue-config.js',
  'initdb/010-venue-api-role.sh','INSTRUCTION.html',
  'import-stage.mjs','verify-stage-package.mjs','provision-rustfs.mjs',
  'venue-judge-permissions.mjs','provision-existing-staff.mjs',
  'install-journal.sql','upgrade-journal-links.sql','repair-journal-coverage.sql',
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
 # A pre-season-manager installation has only one Stage and no pointer yet.
 # psql conditionals keep the missing-table branch out of SQL parsing.
 $sql=@'
SELECT to_regclass('venue_private.active_stage') IS NULL AS legacy \gset
\if :legacy
SELECT id FROM public."Stage" LIMIT 2;
\else
SELECT stage_id FROM venue_private.active_stage WHERE singleton=true;
\endif
'@
 $rows=@($sql | & docker @(Get-VenueComposeArguments) exec -T db psql -X -A -t -v 'ON_ERROR_STOP=1' -U usd_venue_root -d usd_venue)
 Assert-Exit 'inspect active stage'
 return $rows.Count -eq 1 -and [string]$rows[0] -ceq $StageId
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
 $newFile=$(if($StageFile){$StageFile}else{Select-VenueFile 'Новый подписанный этап из админки USD' 'Этап (*.json)|*.json'})
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
 Set-VenueStep 'check-stage-switch'
 Start-VenueDatabase
 $priorLocated=Test-Path -LiteralPath (Join-Path $target 'local-private/setup-state.json') -PathType Leaf
 if(-not(Test-IsActiveVenueStage $old.stageId)){
  if($priorLocated -and (Test-IsActiveVenueStage $newId)){
   # The signed import committed before the previous install finished.
   Install-NextVenueWorkspace $target $newFile
   return
  }
  throw 'Откройте текущий этап через ярлык USD. Исторические этапы доступны в архиве.'
 }
 $sql="SELECT count(*) FROM public.`"Stage`" WHERE id='$newId';"
 $exists=@($sql | & docker @(Get-VenueComposeArguments) exec -T db psql -X -A -t -v 'ON_ERROR_STOP=1' -U usd_venue_root -d usd_venue)
 Assert-Exit 'detect an already installed stage'
 if($exists.Count -ne 1 -or $exists[0] -cne '0'){throw 'Этап уже есть в локальной базе. Откройте архив этапов.'}
 # A local encrypted snapshot and the original database both remain available.
 $workspace=New-VenueStageWorkspace $newId
 Repair-VenueCoverageIfNeeded
 Get-Content -LiteralPath (Join-Path $Root 'upgrade-journal-links.sql') -Raw -Encoding UTF8 |
  & docker @(Get-VenueComposeArguments) exec -T db psql -v 'ON_ERROR_STOP=1' -U usd_venue_root -d usd_venue
 Assert-Exit 'prepare per-stage journal'
 $wasRunning=Test-VenueJudgingRunning
 try{
  $archive=Export-VenueReturn -LeaveApiStopped -Automatic -LocalArchive
  Write-Host 'Резервный файл текущего этапа сохранён. Отправить его можно позже.'
  Invoke-Compose @('stop') 'pause shared server without deleting any data'
  Install-NextVenueWorkspace $workspace $newFile
 }catch{
  try{
   Start-VenueDatabase
   if((Test-IsActiveVenueStage $old.stageId) -and $wasRunning){Restore-VenueStack}
  }catch{Write-Host 'База сохранена.'}
  throw
 }
}

function Install-NextVenueWorkspace([string]$Workspace,[string]$File){
 $previous=$LASTEXITCODE
 $global:LASTEXITCODE=0
 try{
  & (Join-Path $Workspace 'venue-control.ps1') -Action install -StageFile $File -PublicKeyFile $PublicKeyFile -StaffKeyFile $StaffKeyFile -TrustedFingerprint $TrustedFingerprint -Operator:$Operator
  Assert-Exit 'append next signed stage to shared database'
 }finally{$global:LASTEXITCODE=$previous}
 Write-Host ('USD VENUE WORKSPACE: '+$Workspace)
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

function Create-ExistingStaff([object]$State,[array]$Mounts,[switch]$CheckOnly,[switch]$Preflight){
 if([string]::IsNullOrWhiteSpace([string]$State.accessKey) -or
  !(Test-Path -LiteralPath $State.accessKey -PathType Leaf)){
  throw 'Для настоящего этапа требуется отдельный ключ существующих аккаунтов USD'
 }
 $staffMounts=@('--volume',($State.accessKey+':/app/venue-access-key.txt:ro'),
  '--volume',((Join-Path $Root 'venue-judge-permissions.mjs')+':/app/venue-judge-permissions.mjs:ro'),
  '--volume',((Join-Path $Root 'provision-existing-staff.mjs')+':/app/provision-existing-staff.mjs:ro'))
$checkArgs=@();if($Preflight){$checkArgs=@('--preflight')}elseif($CheckOnly){$checkArgs=@('--check')}
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
function Assert-VenueDatabaseVolume {
 Assert-VenueDatabaseVolumeForProject (Get-VenueProject)
}
function Assert-VenueDatabaseVolumeForProject([string]$Project){
 if($project -cnotmatch '^usd-venue-[0-9a-f]{32}$'){
  throw 'Невозможно подтвердить проект базы данных USD. Ничего не изменено.'
 }
 $volume=$project+'_venue_db'
 $prior=$ErrorActionPreference
 try{
  $ErrorActionPreference='Continue'
  $rows=@(& docker volume inspect --format '{{json .Labels}}' $volume 2>$null)
  $code=$LASTEXITCODE
 }finally{$ErrorActionPreference=$prior}
 if($code -ne 0 -or $rows.Count -ne 1){
  throw 'Том прежней базы USD не найден. Пустая база НЕ создана. Проверьте сохранённые Docker volumes перед повторной установкой.'
 }
 try{$labels=ConvertFrom-Json -InputObject ([string]$rows[0]) -ErrorAction Stop}
 catch{throw 'Не удалось проверить метки существующего тома базы USD'}
 if($null -eq $labels -or
    [string]$labels.'com.docker.compose.project' -cne $project -or
    [string]$labels.'com.docker.compose.volume' -cne 'venue_db'){
  throw 'Том базы принадлежит другому проекту или не подтверждён. Данные не изменены.'
 }
}
# Prevent Compose from creating blank replacement media/CA volumes on replay.
# Only inspect stage-owned volumes; never delete or automatically reinitialize.
function Assert-VenueVolumeRetained([string[]]$Names){
 $project=Get-VenueProject
 if($project -cnotmatch '^usd-venue-[0-9a-f]{32}$'){
  throw 'Невозможно подтвердить проект сохранённых данных USD'
 }
 foreach($name in $Names){
  if($name -cnotin @('venue_media','venue_ca','venue_caddy_config')){
   throw 'Неизвестный тип сохраняемого тома USD'
  }
  $volume=$project+'_'+$name
  $prior=$ErrorActionPreference
  try{
   $ErrorActionPreference='Continue'
   $rows=@(& docker volume inspect --format '{{json .Labels}}' $volume 2>$null)
   $code=$LASTEXITCODE
  }finally{$ErrorActionPreference=$prior}
  if($code -ne 0 -or $rows.Count -ne 1){
   throw ('Не найден сохранённый том '+$name+'. Docker не будет создавать пустую замену автоматически.')
  }
  try{$labels=ConvertFrom-Json -InputObject ([string]$rows[0]) -ErrorAction Stop}
  catch{throw ('Повреждены метки сохранённого тома '+$name)}
  if($null -eq $labels -or
     [string]$labels.'com.docker.compose.project' -cne $project -or
     [string]$labels.'com.docker.compose.volume' -cne $name){
   throw ('Сохранённый том '+$name+' не принадлежит текущему этапу')
  }
 }
}
# Read-only Windows preflight: pg_isready does not check that the restricted
# API role exists or that it is NOT PostgreSQL superuser. A partial/legacy
# Docker volume can therefore pass migration and fail on first signed import.
function Assert-VenueDatabaseImportRole {
 $sql="SELECT COALESCE((SELECT rolsuper::text FROM pg_roles WHERE rolname='usd_venue'),'missing') || '|' || COALESCE((SELECT rolsuper::text FROM pg_roles WHERE rolname='usd_venue_root'),'missing');"
 $rows=@(& docker @(Get-VenueComposeArguments) exec -T db psql -X -A -t -v 'ON_ERROR_STOP=1' -U usd_venue_root -d usd_venue -c $sql)
 Assert-Exit 'read-only signed-import database role preflight'
 if($rows.Count -ne 1){throw 'Локальная БД не вернула состояние ролей. Импорт не выполнялся; сохраните Docker volumes.'}
 switch([string]$rows[0]){
  'false|true' {Write-Host 'USD VENUE DB ROLE PREFLIGHT VERIFIED';return}
  'true|true' {throw 'DATABASE_UNSAFE_SUPERUSER_ROLE: роль usd_venue имеет права superuser. Данные сохранены, требуется безопасное исправление прав.'}
  'missing|true' {throw 'DATABASE_APP_ROLE_MISSING: в сохранённой БД отсутствует роль usd_venue. Пустая база не создавалась.'}
  default {throw 'DATABASE_ROLE_MISMATCH: роли локальной БД не совпадают с установкой USD. Импорт остановлен без изменения данных.'}
 }
}
function Wait-VenueLanReady([object]$State){
 if(!$State -or [string]$State.image -cnotmatch '^[a-f0-9]{40}$' -or
    [string]$State.stageId -cnotmatch '^[0-9a-f-]{36}$'){
  throw 'Невозможно подтвердить запуск подписанного этапа USD'
 }
 $apiRevision=Get-VenueRuntimeApiSha (Read-Env)
 $caChecked=$false
 for($attempt=0;$attempt -lt 40;$attempt++){
  if((Test-VenueApiReady -ExpectedSha $apiRevision -ExpectedStage $State.stageId) -and
     (Test-VenueGatewayReady $State.ip)){
   if(!$caChecked){
    try{Export-VenueCA;$caChecked=$true}catch{Write-Host ('USD VENUE TLS: '+$_.Exception.Message)}
   }
   if(Test-VenueHttpsReady $State.ip $State.stageId){return}
  }
  Start-Sleep -Seconds 2
 }
 throw 'Локальный API/HTTPS не подтвердил готовность этапа. Установка сохранена, повторите USD — Установка; база не удаляется.'
}
function Start-VenueDatabase {
 $state=Read-State
 if(!$state -or $state.phase -eq 'CONFIGURED'){
  throw 'До первого запуска базы требуется проверка подписанного этапа. Запустите USD — Установка.'
 }
 Assert-VenueDatabaseVolume
 $ids=@(& docker @(Get-VenueComposeArguments) ps -a -q db)
 Assert-Exit 'inspect existing stage DB container'
 $ids=@($ids|Where-Object {-not [string]::IsNullOrWhiteSpace([string]$_)})
 if($ids.Count -gt 1){throw 'Найдены неоднозначные контейнеры локальной базы. Данные не изменены.'}
 if($ids.Count -eq 1){
  $id=[string]$ids[0]
  if($id -cnotmatch '^[a-f0-9]{12,64}$'){throw 'Docker вернул неверный идентификатор базы'}
  $labels=Read-VenueDockerLabels 'container' $id
  if([string]$labels.'com.docker.compose.project' -cne (Get-VenueProject) -or
     [string]$labels.'com.docker.compose.service' -cne 'db'){
   throw 'Контейнер базы не принадлежит текущему этапу. Данные не изменены.'
  }
  $running=@(& docker @(Get-VenueComposeArguments) ps --status running -q db)
  Assert-Exit 'inspect running stage DB container'
  if($running -notcontains $id){
   Invoke-Compose @('start','db') 'start stopped database without reconfiguration'
  }
 }else{
  Invoke-Compose @('up','-d','--no-deps','--no-build','--no-recreate','--pull','never','db') 'restore missing database container from existing volume'
 }
 $prior=$ErrorActionPreference
 try{
  $ErrorActionPreference='Continue'
  for($attempt=0;$attempt -lt 30;$attempt++){
   & docker @(Get-VenueComposeArguments) exec -T db pg_isready -U usd_venue -d usd_venue 2>$null|Out-Null
   if($LASTEXITCODE -eq 0){return}
   Start-Sleep -Seconds 2
  }
 }finally{$ErrorActionPreference=$prior}
 throw 'Локальная база ещё не готова. Данные сохранены; повторите запуск.'
}
function Test-VenueJudgingRunning {
 $rows=@(& docker @(Get-VenueComposeArguments) ps --status running -q api)
 Assert-Exit 'inspect previous judging state'
 return @($rows|Where-Object {$_}).Count -gt 0
}
function Restore-VenueStack {
 Invoke-Compose @('start') 'restore all previously installed services after cancelled stage switch'
}
function Update-ExpiredVenueSetupPackage([object]$State){
 if($Silent){throw 'Срок пакета истёк. Скачайте новый пакет этого этапа и его ключ судей (.key), затем откройте USD-Install.cmd.'}
 Write-Host 'Скачайте свежий пакет того же этапа и ключ судей (.key) из одной выгрузки админки USD.'
 if($Operator -and (!$StageFile -or !$StaffKeyFile)){throw 'Срок пакета истёк. Войдите в USD и нажмите «Продолжить установку».'}
 $selected=if($StageFile){$StageFile}else{Select-VenueFile 'Свежий подписанный пакет того же этапа' 'Файл этапа (*.json)|*.json'}
 if((Get-Item -LiteralPath $selected).Length -gt (12MB+256KB)){throw 'Пакет этапа слишком большой'}
 $raw=[IO.File]::ReadAllText($selected)
 $payload=$raw|ConvertFrom-Json
 if([string]$payload.snapshot.stageId -cne [string]$State.stageId -or
    [string]$payload.integrity.publicKeyFingerprint -cne [string]$State.fingerprint){
  throw 'Нужен свежий пакет того же этапа с прежним доверенным ключом.'
 }
 if([string]$payload.snapshot.syncAuthorization.token -cnotmatch '^[A-Za-z0-9_-]{43}$'){
  throw 'Выберите новый пакет этапа для автоматической синхронизации.'
 }
 $selectedKey=if($StaffKeyFile){$StaffKeyFile}else{Select-VenueFile 'Ключ судей из той же выгрузки' 'Ключ доступа (*.key)|*.key'}
 if((Get-Item -LiteralPath $selectedKey).Length -gt 512){throw 'Файл ключа судей слишком большой'}
 $key=[IO.File]::ReadAllText($selectedKey).Trim()
 if($key -cnotmatch '^[A-Za-z0-9_-]{43}$'){throw 'Неверный формат ключа судей'}
 # Publish the package and key together via the state pointer only after both
 # are verified. The old files and DB credentials survive a cancelled retry.
 $candidate=$State.PSObject.Copy()
 $suffix=[guid]::NewGuid().ToString('N')
 $candidate.package=Join-Path $PrivateDir ('signed-stage-'+$suffix+'.json')
 $candidate.accessKey=Join-Path $PrivateDir ('staff-access-'+$suffix+'.key')
 try{
  Write-VenueImmutableBootstrapFile $candidate.package $raw
  Write-VenueImmutableBootstrapFile $candidate.accessKey $key
  $mounts=Get-VenueStageMounts $candidate
  try{Invoke-VenueStageCheck $mounts '--dry-run'}catch{
   if($_.Exception.Data['VenueExitCode'] -eq 20){throw 'Выбранный пакет тоже просрочен. Сверьте время ноутбука и выберите свежую выгрузку этого этапа.'}
   throw
  }
  Create-ExistingStaff $candidate $mounts -Preflight
 }catch{
  foreach($file in @($candidate.package,$candidate.accessKey)){
   if(Test-Path -LiteralPath $file -PathType Leaf){Remove-Item -LiteralPath $file -Force}
  }
  throw
 }
 Set-SetupPhase $candidate $candidate.phase
 $State.package=$candidate.package
 $State.accessKey=$candidate.accessKey
 return $mounts
}
function Confirm-VenueStaffKey([object]$State,[array]$Mounts){
 $isFresh=[array]::IndexOf($Phases,[string]$State.phase) -lt [array]::IndexOf($Phases,'IMPORTED')
 try{
  if($isFresh){Create-ExistingStaff $State $Mounts -Preflight}
  else{Create-ExistingStaff $State $Mounts -CheckOnly}
  return
 }catch{
  if($Silent){throw}
  Write-Host 'Ключ судей не подходит. Выберите ключ .key именно этого этапа.'
  $replacement=Select-VenueFile 'Ключ судей выбранного этапа' 'Ключ доступа (*.key)|*.key'
  $value=[IO.File]::ReadAllText($replacement).Trim()
  if($value -cnotmatch '^[A-Za-z0-9_-]{43}$'){throw 'Неверный формат ключа судей'}
  $temp=Join-Path $PrivateDir ('staff-key-'+[guid]::NewGuid().ToString('N')+'.tmp')
  Write-PrivateFile $temp $value
  Move-Item -LiteralPath $temp -Destination $State.accessKey -Force
  if($isFresh){Create-ExistingStaff $State $Mounts -Preflight}
  else{Create-ExistingStaff $State $Mounts -CheckOnly}
 }
}

# First boot must work without registry access when all five exact images
# are already cached. A normal "compose pull" would contact registries again.
function Test-VenueRuntimeImagesCached([string]$Sha){
 if($Sha -cnotmatch '^[a-f0-9]{40}\z'){return $false}
 $required=@(
  ('ghcr.io/kolyagazha89/usd-2.0-api:'+$Sha),
  ('ghcr.io/kolyagazha89/usd-2.0-frontend:'+$Sha),
  'postgres:18-alpine','rustfs/rustfs:1.0.4','caddy:2-alpine'
 )
 foreach($ref in $required){
  try{
   $id=@(& docker image inspect --format '{{.ID}}' $ref 2>$null)
   if($LASTEXITCODE -ne 0 -or $id.Count -ne 1 -or [string]::IsNullOrWhiteSpace([string]$id[0])){
    return $false
   }
  }catch{return $false}
 }
 return $true
}
# A previously downloaded, immutable API/frontend image pair is sufficient
# for offline setup. Validate both embedded revision labels and offline modules
# before reusing it; never trust only a local tag or an unrelated DEMO container.
function Get-CachedVenueReleaseSha {
 Set-VenueStep 'resolve-release-cached-images'
 $refs=@()
 try{
  $refs=@(& docker image ls --format '{{.Repository}}:{{.Tag}}' ghcr.io/kolyagazha89/usd-2.0-api 2>$null)
  if($LASTEXITCODE -ne 0){return $null}
 }catch{return $null}
 $seen=@{}
 foreach($ref in $refs){
  if(-not ([string]$ref -cmatch '^ghcr[.]io/kolyagazha89/usd-2[.]0-api:([a-f0-9]{40})\z')){continue}
  $candidate=[string]$Matches[1]
  if($seen.ContainsKey($candidate)){continue}
  $seen[$candidate]=$true
  try{
   Assert-VenueReleaseImages $candidate
   Write-Host ('USD VENUE: найден проверенный локальный релиз '+$candidate)
   return $candidate
  }catch{
   Write-Host ('USD VENUE: локальная версия '+$candidate+' неполная, проверяем другие')
  }
 }
 return $null
}
function Get-VenueReleaseSha([object]$sharedConfig){
 if($sharedConfig){
  $local=Get-VenueRuntimeApiSha $sharedConfig
  try{
   Assert-VenueReleaseImages $local
   return $local
  }catch{Write-Host 'USD VENUE: образ предыдущего этапа требует загрузки'}
 }
 $cached=Get-CachedVenueReleaseSha
 $sha=$null
 foreach($endpoint in @(
  [pscustomobject]@{Uri='https://api.usd-russia.ru/release';Step='resolve-release-online-api'},
  [pscustomobject]@{Uri='https://app.usd-russia.ru/usd-release.json';Step='resolve-release-online-frontend'}
 )){
  Set-VenueStep $endpoint.Step
  try{
   $release=Invoke-RestMethod -Uri $endpoint.Uri -TimeoutSec 8 -ErrorAction Stop
   $candidate=[string]$release.revision
   if($candidate -cnotmatch '^[a-f0-9]{40}\z'){throw 'Неверная версия USD в ответе сервера'}
   $sha=$candidate
   break
  }catch{Write-Host ('USD VENUE: источник версии '+$endpoint.Uri+' недоступен: '+$_.Exception.Message)}
 }
 if(!$sha -and $cached){return $cached}
 if($sha -and $sha -ceq $cached){return $cached}
 if(!$sha){
  # CI-published verified USD release candidate; not a mutable :latest tag.
  # If the operator cannot reach either USD domain, GHCR alone can supply it.
  $sha='aa0d1a83c70b894a8b5e36141927bc572c71b3c5'
  Set-VenueStep 'resolve-release-published-fallback'
  Write-Host ('USD VENUE: оба сайта не ответили, используем опубликованную проверенную версию '+$sha)
 }
 Set-VenueStep 'download-immutable-release-images'
 try{
  Invoke-Docker @('pull',('ghcr.io/kolyagazha89/usd-2.0-api:'+$sha)) 'API image pull'
  Invoke-Docker @('pull',('ghcr.io/kolyagazha89/usd-2.0-frontend:'+$sha)) 'frontend image pull'
  Set-VenueStep 'verify-immutable-release-images'
  Assert-VenueReleaseImages $sha
 }catch{
  throw ('Не удалось получить проверенные образы из ghcr.io. Проверьте интернет до GitHub Container Registry или заранее загрузите образы на ноутбук. Данные Docker сохранены. Причина: '+$_.Exception.Message)
 }
 return $sha
}
