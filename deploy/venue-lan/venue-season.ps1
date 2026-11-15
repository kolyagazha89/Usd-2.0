#requires -Version 5.1
# USD LAN: one Docker project and one accumulating PostgreSQL for the season.
# Root-owned active stage, per-stage journal chains and signed next-stage import.
function Get-VenueProjectForStage([string]$StageId){
 if($StageId -cnotmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'){
  throw 'Некорректный UUID этапа'
 }
 return 'usd-venue'
}
function Get-VenueProject {
 $state=Read-State
 if(!$state -or $state.PSObject.Properties.Name -notcontains 'project'){return 'usd-venue'}
 $project=[string]$state.project
 # Retain an existing stage-prefixed project from an earlier installation,
 # but never create a second project when importing the next real stage.
 if($project -cne 'usd-venue' -and $project -cnotmatch '^usd-venue-[0-9a-f]{32}$'){
  throw 'Незнакомый Docker-проект. Данные не изменены.'
 }
 return $project
}
function Assert-NoOtherVenueGatewayRunning {
 $expected=Get-VenueProject
 $projects=@(& docker ps --filter 'label=com.docker.compose.service=gateway' --format '{{.Label "com.docker.compose.project"}}')
 Assert-Exit 'check other USD gateways'
 foreach($project in $projects){
  if($project -like 'usd-venue*' -and $project -cne $expected){
   throw 'Другая установка USD уже использует HTTPS. Не смешивайте Docker-проекты.'
  }
 }
}
function Get-ActiveVenueStageId {
 $project=Get-VenueProject
 $sql='SELECT stage_id FROM venue_private.active_stage'
 $output=@(& docker compose -p $project -f (Join-Path $Root 'compose.yaml') exec -T db psql -X -A -t -v 'ON_ERROR_STOP=1' -U usd_venue_root -d usd_venue -c $sql)
 Assert-Exit 'verify current PostgreSQL active stage'
 $stages=@($output | Where-Object {$_ -match '^[a-f0-9-]{36}$'})
 if($stages.Count -ne 1){throw 'Не удалось подтвердить активный этап в локальной PostgreSQL'}
 return [string]$stages[0]
}
function Test-VerifiedVenueAck([string]$StageId){
 if($StageId -cnotmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'){
  throw 'Недостоверный UUID для проверки подтверждения Ubuntu'
 }
 # All stages share one global PostgreSQL sequence; SHA chain is PER stage.
 $sql="SELECT COALESCE((SELECT hash FROM venue_private.operation_journal WHERE stage_id='$StageId' ORDER BY sequence DESC LIMIT 1), repeat('0',64));"
 $project=Get-VenueProject
 $rows=@(& docker compose -p $project -f (Join-Path $Root 'compose.yaml') exec -T db psql -X -A -t -v 'ON_ERROR_STOP=1' -U usd_venue_root -d usd_venue -c $sql)
 Assert-Exit 'inspect current stage journal head'
 $hash=@($rows | Where-Object {$_ -match '^[a-f0-9]{64}$'})
 if($hash.Count -ne 1){throw 'Текущий хеш этапа не подтверждён'}
 $ack=Join-Path $PrivateDir ('sync-ack-'+$StageId+'-'+$hash[0]+'.json')
 if(!(Test-Path -LiteralPath $ack -PathType Leaf)){
  # Single-stage installations before season support used a hash-only
  # filename. Trust it ONLY if the signed receipt stageId matches exactly.
  $legacy=Join-Path $PrivateDir ('sync-ack-'+$hash[0]+'.json')
  if(!(Test-Path -LiteralPath $legacy -PathType Leaf)){return $false}
  $ack=$legacy
 }
 $receipt=Get-Content -LiteralPath $ack -Raw -Encoding UTF8|ConvertFrom-Json
 return ($receipt.accepted -eq $true -and
  [string]$receipt.stageId -ceq $StageId -and
  [string]$receipt.journalEndHash -ceq [string]$hash[0])
}
function Save-VenueSeasonState([object]$State){
 $tmp=Join-Path $PrivateDir ('season-state-'+[guid]::NewGuid().ToString('N')+'.tmp')
 Write-PrivateFile $tmp ($State|ConvertTo-Json -Depth 8)
 Move-Item -LiteralPath $tmp -Destination $StateFile -Force
}
function Set-VenueSeasonEnv([string]$StageId,[string]$Fingerprint){
 $rows=[IO.File]::ReadAllLines($EnvFile)
 $a=0;$b=0
 for($i=0;$i -lt $rows.Length;$i++){
  if($rows[$i].StartsWith('VENUE_STAGE_ID=')){$rows[$i]='VENUE_STAGE_ID='+$StageId;$a++}
  if($rows[$i].StartsWith('VENUE_SIGNING_KEY_FINGERPRINT=')){
   $rows[$i]='VENUE_SIGNING_KEY_FINGERPRINT='+$Fingerprint;$b++
  }
 }
 if($a -ne 1 -or $b -ne 1){throw 'Повреждён .env, переключение запрещено'}
 $tmp=Join-Path $PrivateDir ('season-env-'+[guid]::NewGuid().ToString('N')+'.tmp')
 Write-PrivateFile $tmp (($rows -join [Environment]::NewLine)+[Environment]::NewLine)
 Move-Item -LiteralPath $tmp -Destination $EnvFile -Force
}
function Backup-VenueSeasonDb([string]$StageId){
 $project=Get-VenueProject
 $container=@(& docker compose -p $project -f (Join-Path $Root 'compose.yaml') ps -q db | Select-Object -First 1)
 Assert-Exit 'locate current database'
 if($container.Count -ne 1 -or [string]$container[0] -cnotmatch '^[a-f0-9]{12,64}$'){
  throw 'Не удалось найти единственную локальную PostgreSQL для бэкапа'
 }
 $archive=Join-Path (Join-Path $PrivateDir 'stage-history') $StageId
 New-Item -ItemType Directory -Path $archive -Force|Out-Null
 $name='before-'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')+'-'+[guid]::NewGuid().ToString('N').Substring(0,8)+'.dump'
 $path=Join-Path $archive $name
 $remote='/tmp/usd-season-'+[guid]::NewGuid().ToString('N')+'.dump'
 try{
  Invoke-Docker @('exec',$container[0],'pg_dump','-U','usd_venue_root','-d','usd_venue','-Fc','-f',$remote) 'backup old real stages'
  & docker cp ($container[0]+':'+$remote) $path | Out-Null
  Assert-Exit 'copy checked PostgreSQL backup'
 }finally{
  & docker exec $container[0] rm -f $remote 2>$null | Out-Null
 }
 if(!(Test-Path -LiteralPath $path -PathType Leaf) -or (Get-Item $path).Length -lt 1024){
  throw 'Не удалось проверить резервный дамп PostgreSQL. Переключение запрещено'
 }
 $acl=New-Object System.Security.AccessControl.FileSecurity
 $acl.SetAccessRuleProtection($true,$false)
 $identity=[System.Security.Principal.WindowsIdentity]::GetCurrent().User
 $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($identity,'FullControl','Allow')))
 [IO.File]::SetAccessControl($path,$acl)
 Write-Host ('Бэкап локальной истории: '+$path)
 Write-Host ('SHA256: '+(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash)
 return $path
}
function Save-VenueHistoryBeforeSwitch([object]$Old){
 $archive=Join-Path (Join-Path $PrivateDir 'stage-history') ([string]$Old.stageId)
 New-Item -ItemType Directory -Path $archive -Force|Out-Null
 $stateCopy=Join-Path $archive 'previous-state.json'
 $envCopy=Join-Path $archive 'previous.env'
 if(!(Test-Path -LiteralPath $stateCopy)){Write-PrivateFile $stateCopy ($Old|ConvertTo-Json -Depth 8)}
 if(!(Test-Path -LiteralPath $envCopy)){
  Write-PrivateFile $envCopy ([IO.File]::ReadAllText($EnvFile))
 }
}
function Complete-VenueSeasonTransition([object]$Pending){
 $old=Read-State
 $actual=Get-ActiveVenueStageId
 if($actual -cne [string]$Pending.nextId){
  throw 'База ещё не переключена на новый этап. Предыдущие записи сохранены.'
 }
 if($old.stageId -cne $Pending.nextId){
  if($old.stageId -cne $Pending.previousId){throw 'Обнаружен конфликт локальной истории'}
  Save-VenueHistoryBeforeSwitch $old
  Set-VenueSeasonEnv $Pending.nextId $Pending.fingerprint
  $old.stageId=$Pending.nextId
  $old.fingerprint=$Pending.fingerprint
  $old.package=$Pending.package
  $old.publicKey=$Pending.publicKey
  $old.accessKey=$Pending.accessKey
  $old.phase='SEASON_IMPORTED'
  Save-VenueSeasonState $old
 }
}
function Recover-VenueSeasonTransition {
 $marker=Join-Path $PrivateDir 'season-transition.json'
 if(!(Test-Path -LiteralPath $marker -PathType Leaf)){return}
 Ensure-DockerReady
 Invoke-Compose @('up','-d','--wait','--no-build','--pull','never','db') 'recover local season stage'
 $pending=Get-Content -LiteralPath $marker -Raw -Encoding UTF8|ConvertFrom-Json
 if([string]$pending.nextId -cnotmatch '^[a-f0-9-]{36}$'){throw 'Повреждён маркер переключения'}
 $active=Get-ActiveVenueStageId
 if($active -ceq [string]$pending.previousId){
  # Power failed before the signed baseline transaction committed.
  Remove-Item -LiteralPath $marker -Force
  Write-Host 'Импорт следующего этапа не был завершён. Старый этап сохранён.'
  return
 }
 if($active -cne [string]$pending.nextId){
  throw 'Невозможно восстановить переключение: локальная PostgreSQL не совпадает'
 }
 Complete-VenueSeasonTransition $pending
}
function Switch-ToNextStage {
 if($Silent){throw 'Смена этапа требует участия администратора'}
 Assert-VenueCompose
 Ensure-DockerReady
 Recover-VenueSeasonTransition
 $old=Read-State
 if(!$old -or $old.phase -ne 'READY'){throw 'Сначала завершите предыдущую установку USD'}
 $cfg=Read-Env
 if($cfg['VENUE_STAGE_ID'] -cne [string]$old.stageId -or
  $cfg['VENUE_SIGNING_KEY_FINGERPRINT'] -cne [string]$old.fingerprint){
  throw 'Текущая подписанная установка не совпадает с файлом конфигурации'
 }
 $signedFile=$(if($StageFile){$StageFile}else{Select-VenueFile 'Выберите новый подписанный этап' 'Этап (*.json)|*.json'})
 $pemFile=Select-VenueFile 'Открытый ключ подписи из админки USD' 'Ключ (*.pem)|*.pem'
 $keyFile=Select-VenueFile 'Отдельный ключ входа судей' 'Ключ (*.key)|*.key'
 $signed=Get-Content -LiteralPath $signedFile -Raw -Encoding UTF8|ConvertFrom-Json
 $nextId=[string]$signed.snapshot.stageId
 $null=Get-VenueProjectForStage $nextId
 if($nextId -ceq [string]$old.stageId){throw 'Это текущий этап, выберите другой'}
 $fingerprint=(Read-VenueFingerprint).Trim()
 if($fingerprint -cnotmatch '^[a-f0-9]{64}$' -or
  $fingerprint -cne [string]$signed.integrity.publicKeyFingerprint -or
  $fingerprint -cne [string]$old.fingerprint){
  throw 'Подписывающий ключ изменён или не совпадает. Требуется отдельное подтверждение организатора'
 }
 $newKey=[IO.File]::ReadAllText($keyFile).Trim()
 if($newKey -cnotmatch '^[A-Za-z0-9_-]{43}$' -or
  [string]$signed.snapshot.staffAccess.algorithm -cne 'AES-256-GCM'){
  throw 'Неверный защищённый список сотрудников'
 }
 $archive=Join-Path (Join-Path $PrivateDir 'stage-history') $nextId
 if(Test-Path -LiteralPath $archive){throw 'Этот этап уже загружался. Автоматически перезаписывать его запрещено'}
 New-Item -ItemType Directory -Path $archive -Force|Out-Null
 $package=Join-Path $archive 'signed-stage.json'
 $pem=Join-Path $archive 'signing-public.pem'
 $staffKey=Join-Path $archive 'staff-access.key'
 Write-PrivateFile $package ([IO.File]::ReadAllText($signedFile))
 Write-PrivateFile $pem ([IO.File]::ReadAllText($pemFile))
 Write-PrivateFile $staffKey $newKey
 $mounts=@('--volume',($package+':/app/new-stage.json:ro'),
  '--volume',($pem+':/app/new-public.pem:ro'),
  '--volume',((Join-Path $Root 'verify-stage-package.mjs')+':/app/verify-stage-package.mjs:ro'))
 Invoke-Compose (@('run','--rm','--no-deps')+$mounts+
  @('--entrypoint','node','api','/app/verify-stage-package.mjs',
    '/app/new-stage.json','/app/new-public.pem')) 'verify next stage before any DB mutation'
 if(-not(Confirm-VenueAction ('Импортировать этап '+$nextId+' в существующую PostgreSQL?'+
  [Environment]::NewLine+'Старые результаты и участники сохранятся.'+
  [Environment]::NewLine+'Сначала требуется подтверждённая синхронизация Ubuntu.'))){
  throw 'Смена этапа отменена. Старые данные не изменены.'
 }
 $running=@(& docker compose -p (Get-VenueProject) -f (Join-Path $Root 'compose.yaml') ps --status running -q api)
 Assert-Exit 'inspect judge API'
 $wasRunning=@($running|Where-Object {$_}).Count -gt 0
 $baselineApplied=$false
 try{
  if($wasRunning){Invoke-Compose @('stop','api') 'freeze judging before new signed stage'}
  Invoke-Compose @('up','-d','--wait','--no-build','--pull','never','db') 'keep existing PostgreSQL running'
  if((Get-ActiveVenueStageId) -cne $old.stageId){throw 'Активный этап неожиданно изменился'}
  if(-not(Test-VerifiedVenueAck $old.stageId)){
   $bundle=Export-VenueReturn -LeaveApiStopped -Automatic
   $receipt=Sync-VenueReturn -Bundle $bundle
   if($receipt.accepted -ne $true -or -not(Test-VerifiedVenueAck $old.stageId)){
    throw 'Ubuntu не подтвердила все результаты старого этапа'
   }
  }
  $null=Backup-VenueSeasonDb $old.stageId
  $pending=[pscustomobject]@{
   previousId=$old.stageId;nextId=$nextId;fingerprint=$fingerprint
   package=$package;publicKey=$pem;accessKey=$staffKey
  }
  $marker=Join-Path $PrivateDir 'season-transition.json'
  Write-PrivateFile $marker ($pending|ConvertTo-Json -Depth 5)
  $env:VENUE_IMPORT_ROOT_USER=$cfg['VENUE_DB_ROOT_USER']
  $env:VENUE_IMPORT_ROOT_PASSWORD=$cfg['VENUE_DB_ROOT_PASSWORD']
  $env:VENUE_STAGE_ID=$nextId
  $env:VENUE_SIGNING_KEY_FINGERPRINT=$fingerprint
  try{
   Invoke-Compose (@('run','--rm','--no-deps',
    '-e','VENUE_IMPORT_ROOT_USER','-e','VENUE_IMPORT_ROOT_PASSWORD',
    '-e','VENUE_STAGE_ID','-e','VENUE_SIGNING_KEY_FINGERPRINT')+$mounts+
    @('--volume',((Join-Path $Root 'import-stage.mjs')+':/app/import-stage.mjs:ro'),
      '--entrypoint','node','api','/app/import-stage.mjs',
      '/app/new-stage.json','/app/new-public.pem','--append',$nextId)) 'append signed next stage to same PostgreSQL'
   $baselineApplied=$true
  }finally{
   Remove-Item Env:\VENUE_IMPORT_ROOT_USER,Env:\VENUE_IMPORT_ROOT_PASSWORD,Env:\VENUE_STAGE_ID,Env:\VENUE_SIGNING_KEY_FINGERPRINT -ErrorAction SilentlyContinue
  }
  Complete-VenueSeasonTransition $pending
  Install-Local
  Write-Host ('Новый этап установлен. База и история прежних этапов сохранены: '+$nextId)
 }catch{
  if(-not $baselineApplied){
   # A network/CLI failure may occur AFTER PostgreSQL commits. Never
   # assume the baseline rolled back just because the CLI returned an error.
   $actual=$null
   try{$actual=Get-ActiveVenueStageId}catch{Write-Host 'Не удалось проверить локальный этап: запуск судей запрещён'}
   if($actual -ceq $old.stageId){
    $marker=Join-Path $PrivateDir 'season-transition.json'
    if(Test-Path -LiteralPath $marker){Remove-Item -LiteralPath $marker -Force}
    if($wasRunning){
     try{Restore-VenueApi}catch{Write-Host 'База сохранена; восстановите вход через USD — Офлайн'}
    }
   }else{
    Write-Host 'Исход переключения неопределён: данные сохранены. Запустите USD-Install.cmd для восстановления.'
   }
  }else{
   Write-Host 'Новый этап уже находится в PostgreSQL. Запустите USD-Install.cmd для безопасного завершения установки.'
  }
  throw
 }
}
