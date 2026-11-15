#requires -Version 5.1
# Real USD seasons: a separate Docker project and persistent volumes per stage.
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
 $expected=Get-VenueProjectForStage ([string]$state.stageId)
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
 $sql="SELECT COALESCE((SELECT hash FROM venue_private.operation_journal ORDER BY sequence DESC LIMIT 1), repeat('0',64));"
 $project=Get-VenueProject
 $rows=@(& docker compose -p $project -f (Join-Path $Root 'compose.yaml') exec -T db psql -X -A -t -v 'ON_ERROR_STOP=1' -U usd_venue_root -d usd_venue -c $sql)
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
 return $target
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
 if(-not(Confirm-VenueAction ('Перейти к следующему этапу '+$newId+'?'+
  [Environment]::NewLine+'Проверим передачу текущих результатов на Ubuntu.'+
  [Environment]::NewLine+'Предыдущая база и все результаты останутся на этом ноутбуке.'))){
  throw 'Переключение отменено. Данные сохранены.'
 }
 $project=Get-VenueProject
 $running=@(& docker compose -p $project -f (Join-Path $Root 'compose.yaml') ps --status running -q api)
 Assert-Exit 'inspect judging service'
 $wasRunning=@($running|Where-Object {$_}).Count -gt 0
 $frozen=$false
 try{
  if($wasRunning){
   Invoke-Compose @('stop','api') 'freeze current stage'
   $frozen=$true
  }
  Invoke-Compose @('up','-d','--wait','--no-build','--pull','never','db') 'inspect current journal'
  if(-not(Test-VerifiedVenueAck $old.stageId)){
   $bundle=Export-VenueReturn -LeaveApiStopped -Automatic
   $synced=Sync-VenueReturn -Bundle $bundle
   if($synced.accepted -ne $true -or -not(Test-VerifiedVenueAck $old.stageId)){
    throw 'Нет точного подтверждения Ubuntu для локального журнала'
   }
  }
  Invoke-Compose @('stop') 'stop former stage while retaining all volumes'
  Remove-Autostart
 }catch{
  if($frozen){
   try{Restore-VenueApi}catch{Write-Host 'База сохранена. Можно снова запустить USD — Офлайн.'}
  }
  throw
 }
 $workspace=New-VenueStageWorkspace $newId
 Write-Host ('АРХИВ ПРОШЛОГО ЭТАПА СОХРАНЁН: '+$old.stageId)
 Write-Host ('НОВАЯ ПАПКА: '+$workspace)
 & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $workspace 'venue-control.ps1') -Action install -StageFile $newFile | Out-Host
 Assert-Exit 'install next independently signed stage'
}
