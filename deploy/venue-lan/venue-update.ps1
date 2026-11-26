#requires -Version 5.1
# Update only the web image and HTTPS gateway; retain the judging API and data.
function Copy-VenueWebVersion([System.Collections.IDictionary]$Config,[hashtable]$Source){
 if($Source.ContainsKey('VENUE_WEB_IMAGE_TAG')){
  $version=[string]$Source['VENUE_WEB_IMAGE_TAG']
  if($version -cnotmatch '^[a-f0-9]{40}\z'){throw 'Неверная версия экрана предыдущего этапа'}
  $Config['VENUE_WEB_IMAGE_TAG']=$version
 }
}
function Test-VenueGatewayReady([string]$Ip,[int]$Port=80){
 # LAN probes must never traverse a Windows/VPN proxy. Do not change global
 # proxy settings: online release downloads still use the operator's network.
 $script:VenueGatewayProbeReason=''
 $reply=$null
 $reader=$null
 try{
  $request=[Net.HttpWebRequest][Net.WebRequest]::Create(('http://'+$Ip+':'+$Port+'/venue/live'))
  $request.Proxy=$null
  $request.AllowAutoRedirect=$false
  $request.Timeout=3000
  $request.ReadWriteTimeout=3000
  $reply=$request.GetResponse()
  if([int]$reply.StatusCode -ne 200){
   $script:VenueGatewayProbeReason='HTTP '+[int]$reply.StatusCode
   return $false
  }
  $reader=New-Object System.IO.StreamReader($reply.GetResponseStream())
  if($reader.ReadToEnd() -notmatch '(?i)<(?:!doctype|html)'){
   $script:VenueGatewayProbeReason='HTTP 200, но ответ не является HTML'
   return $false
  }
  return $true
 }catch{
  $script:VenueGatewayProbeReason=$_.Exception.GetBaseException().Message
  return $false
 }finally{
  if($reader){$reader.Dispose()}
  if($reply){$reply.Close()}
 }
}
function Test-VenueWebRevision([string]$Sha){
 $program=@'
fetch("http://frontend/usd-release.json",{signal:AbortSignal.timeout(3000)})
 .then(async response=>process.exit(response.ok&&(await response.json()).revision===process.argv[2]?0:1))
 .catch(()=>process.exit(2));
'@
 try{
  $program | & docker @(Get-VenueComposeArguments) exec -T api node - $Sha 2>$null | Out-Null
  return $LASTEXITCODE -eq 0
 }catch{return $false}
}
function Get-OnlineVenueReleaseSha {
 # A cached local image is not evidence of the latest public release.
 # Both deployed API and frontend must report one immutable published revision.
 $revisions=@()
 foreach($endpoint in @(
  'https://api.usd-russia.ru/release',
  'https://app.usd-russia.ru/usd-release.json'
 )){
  try{
   $release=Invoke-RestMethod -Uri $endpoint -TimeoutSec 8 -ErrorAction Stop
   $candidate=[string]$release.revision
   if($candidate -cnotmatch '^[a-f0-9]{40}\z'){throw 'Неверная версия сервера'}
   $revisions+=@($candidate)
  }catch{
   Write-Host ('USD VENUE: версия '+$endpoint+' недоступна: '+$_.Exception.Message)
   return $null
  }
 }
 if($revisions.Count -ne 2 -or $revisions[0] -cne $revisions[1]){
  Write-Host 'USD VENUE: API и сайт ещё обновляются. Переход на другую версию отложен.'
  return $null
 }
 return [string]$revisions[0]
}
function Get-VenueRuntimeApiSha([System.Collections.IDictionary]$Config){
 $sha=[string]$Config['VENUE_API_IMAGE_TAG']
 if(!$sha){$sha=[string]$Config['VENUE_IMAGE_TAG']}
 if($sha -cnotmatch '^[a-f0-9]{40}\z'){throw 'Неверная версия локального API USD'}
 return $sha
}
function Set-VenueRuntimeEnvironment([string]$Contents){
 $temp=$EnvFile+'.'+[guid]::NewGuid().ToString('N')+'.tmp'
 try{
  Write-PrivateFile $temp $Contents
  [IO.File]::Replace($temp,$EnvFile,[NullString]::Value)
 }finally{if(Test-Path -LiteralPath $temp){Remove-Item -LiteralPath $temp -Force}}
}
function Save-VenueRegistrationUpgradeBackup {
 # Keep private archives out of the installer workspace and its shared folders.
 $base=[Environment]::GetFolderPath('LocalApplicationData')
 if(!$base){throw 'Защищённая папка резервных копий USD недоступна'}
 $directory=Join-Path (Join-Path $base 'USD-Venue') 'db-backups'
 [IO.Directory]::CreateDirectory($directory)|Out-Null
 $acl=New-Object System.Security.AccessControl.DirectorySecurity
 $acl.SetAccessRuleProtection($true,$false)
 $user=[System.Security.Principal.WindowsIdentity]::GetCurrent().User
 $grant=New-Object System.Security.AccessControl.FileSystemAccessRule($user,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
 $acl.AddAccessRule($grant)
 [IO.Directory]::SetAccessControl($directory,$acl)
 # PowerShell 5.1 stdout is unsuitable for binary PostgreSQL archives.
 $name='before-registration-upgrade-'+[guid]::NewGuid().ToString('N')+'.dump'
 $remote='/tmp/'+$name
 $local=Join-Path $directory $name
 $composeArgs=Get-VenueComposeArguments
 try{
  Invoke-Compose @('exec','-T','db','pg_dump','-U','usd_venue_root','-d','usd_venue','--format=custom','--file',$remote) 'backup existing judging database'
  Invoke-Compose @('exec','-T','db','pg_restore','--list',$remote) 'validate PostgreSQL archive'
  $hash=@(& docker @composeArgs exec -T db sha256sum $remote)
  Assert-Exit 'read PostgreSQL backup checksum'
  if($hash.Count -ne 1 -or $hash[0] -cnotmatch '^([a-f0-9]{64})\s'){throw 'Не удалось подтвердить контрольную сумму копии PostgreSQL'}
  $expected=$Matches[1]
  Invoke-Compose @('cp',('db:'+$remote),$local) 'copy existing database backup'
  if((Get-FileHash -LiteralPath $local -Algorithm SHA256).Hash -ine $expected){
   throw 'Резервная копия на Windows не прошла проверку SHA256'
  }
  Write-Host ('USD VENUE BACKUP: '+$local)
 }finally{
  try{& docker @composeArgs exec -T db rm -f $remote 2>$null | Out-Null}catch{}
 }
}
function Update-LegacyVenueRegistration([object]$State){
 # The exact main image pair below passed publication and LAN database CI.
 # It upgrades the known affected release via two reviewed additive migrations.
 # Other releases still use the ordinary frontend update. Never guess a DB upgrade.
 $legacy='53833411c3ce82424b8c1ac40b029f201eeed863'
 $target='ff93d4957c4ca9f322a2832a511570e10ae65dcb'
 $cfg=Read-Env
 if((Get-VenueRuntimeApiSha $cfg) -cne $legacy){return $false}
 if($State.phase -cne 'READY' -or $cfg['VENUE_IMAGE_TAG'] -cne $State.image -or
    $cfg['VENUE_STAGE_ID'] -cne $State.stageId -or $cfg['VENUE_BIND_IP'] -cne $State.ip -or
    $cfg['VENUE_SIGNING_KEY_FINGERPRINT'] -cne $State.fingerprint){
  throw 'Данные установленного этапа не совпадают. Обновление регистрации остановлено.'
 }
 Set-VenueStep 'download-registration-upgrade'
 if(-not (Test-VenueRuntimeImagesCached $target)){
  foreach($service in @('api','frontend')){
   Invoke-Docker @('pull',('ghcr.io/kolyagazha89/usd-2.0-'+$service+':'+$target)) 'download published registration fix'
  }
 }
 Assert-VenueReleaseImages $target
 Assert-NoOtherVenueGatewayRunning
 Assert-VenueDatabaseVolume
 Assert-VenueVolumeRetained @('venue_media','venue_ca','venue_caddy_config')
 Start-VenueDatabase
 if(-not(Test-IsActiveVenueStage $State.stageId)){throw 'Обновление регистрации выполняется только для текущего этапа'}
 Assert-VenueDatabaseImportRole
 $original=[IO.File]::ReadAllText($EnvFile)
 $newline=[Environment]::NewLine
 $lines=@([IO.File]::ReadAllLines($EnvFile)|Where-Object {$_ -notmatch '^VENUE_(API|WEB)_IMAGE_TAG='})
 $updated=($lines+@(('VENUE_API_IMAGE_TAG='+$target),('VENUE_WEB_IMAGE_TAG='+$target))) -join $newline
 $changed=$false
 try{
  Set-VenueStep 'backup-registration-upgrade'
  Invoke-Compose @('stop','api') 'pause judging during registration upgrade'
  Save-VenueRegistrationUpgradeBackup
  Set-VenueStep 'migrate-registration-upgrade'
  $previous=$env:VENUE_API_IMAGE_TAG
  try{
   $env:VENUE_API_IMAGE_TAG=$target
   Invoke-Compose @('run','--rm','--no-deps','--pull','never','--entrypoint',
    './node_modules/.bin/prisma','api','migrate','deploy','--config','./prisma7.config.ts') 'apply reviewed additive LAN migrations'
  }finally{
   if($null -eq $previous){Remove-Item Env:\VENUE_API_IMAGE_TAG -ErrorAction SilentlyContinue}
   else{$env:VENUE_API_IMAGE_TAG=$previous}
  }
  Set-VenueStep 'activate-registration-upgrade'
  Set-VenueRuntimeEnvironment ($updated+$newline)
  $changed=$true
  Invoke-Compose @('up','-d','--no-build','--no-deps','--pull','never','--force-recreate','api','frontend','gateway') 'start fixed local registration'
  Wait-VenueLanReady $State
  if(-not(Test-VenueWebRevision $target)){throw 'Экран регистрации не подтвердил версию'}
 }catch{
  $failure=$_.Exception.Message
  try{
   $services=@('api')
   if($changed){
    Set-VenueRuntimeEnvironment $original
    $services=@('--force-recreate','api','frontend','gateway')
   }
   Invoke-Compose (@('up','-d','--no-build','--no-deps','--pull','never')+$services) 'restore previous local services'
   Wait-VenueLanReady $State
  }catch{
   throw ('Ошибка обновления регистрации: '+$failure+'. Предыдущий сервер не подтвердил запуск: '+$_.Exception.Message)
  }
  throw ('Ошибка обновления регистрации: '+$failure+'. Предыдущие образы запущены. Данные и журнал сохранены.')
 }
 Write-Host ('USD VENUE: обновлены локальный API и экран регистрации '+$target)
 return $true
}
# A startup cache contains only a confirmed immutable release, never a new
# database/runtime pin. Active judging services must not restart on GUI open.
function Get-VenueInstalledWebSha([object]$State,[hashtable]$Config){
 if($Config.ContainsKey('VENUE_WEB_IMAGE_TAG')){return [string]$Config['VENUE_WEB_IMAGE_TAG']}
 return [string]$State.image
}
function Test-VenueStartupImage([string]$Service,[string]$Sha){
 if($Service -cnotin @('api','frontend') -or $Sha -cnotmatch '^[a-f0-9]{40}\z'){return $false}
 try{
  $labels=Read-VenueDockerLabels 'image' ('ghcr.io/kolyagazha89/usd-2.0-'+$Service+':'+$Sha)
  return [string]$labels.'org.opencontainers.image.revision' -ceq $Sha
 }catch{return $false}
}
function Cache-VenueStartupImages([object]$State){
 if(!$State -or $State.phase -cne 'READY'){return 'not-ready'}
 $cfg=Read-Env
 if($cfg['VENUE_STAGE_ID'] -cne $State.stageId -or $cfg['VENUE_IMAGE_TAG'] -cne $State.image -or
    $cfg['VENUE_BIND_IP'] -cne $State.ip -or $cfg['VENUE_SIGNING_KEY_FINGERPRINT'] -cne $State.fingerprint){
  throw 'Закреплённый этап не совпадает. Автообновление отменено.'
 }
 Set-VenueStep 'check-startup-release'
 $target=Get-OnlineVenueReleaseSha
 if(!$target){return 'offline'}
 if($target -cnotmatch '^[a-f0-9]{40}\z'){throw 'Неверная версия обновления USD'}
 $installed=Get-VenueInstalledWebSha $State $cfg
 $installedApi=Get-VenueRuntimeApiSha $cfg
 if($installed -cnotmatch '^[a-f0-9]{40}\z'){throw 'Неверная установленная версия frontend'}
 foreach($service in @('frontend','api')){
  if(!(Test-VenueStartupImage $service $target)){
   Set-VenueStep ('cache-startup-'+$service)
   Invoke-Docker @('pull',('ghcr.io/kolyagazha89/usd-2.0-'+$service+':'+$target)) 'cache confirmed USD release'
   if(!(Test-VenueStartupImage $service $target)){throw 'Скачанный образ не соответствует версии USD'}
  }
 }
 $marker=Join-Path $PrivateDir 'startup-release.json'
 $temp=$marker+'.'+[guid]::NewGuid().ToString('N')+'.tmp'
 try{
  Write-PrivateFile $temp (@{stage=$State.stageId;fingerprint=$State.fingerprint;from=$installed;fromApi=$installedApi;target=$target}|ConvertTo-Json -Compress)
  if(Test-Path -LiteralPath $marker){[IO.File]::Replace($temp,$marker,[NullString]::Value)}
  else{[IO.File]::Move($temp,$marker)}
 }finally{if(Test-Path -LiteralPath $temp){Remove-Item -LiteralPath $temp -Force}}
 if($target -ceq $installed -and $target -ceq $installedApi){return 'current'}
 return 'cached'
}
function Get-VenueCachedWebTarget([object]$State){
 try{
  $marker=Join-Path $PrivateDir 'startup-release.json'
  if(!(Test-Path -LiteralPath $marker -PathType Leaf)){return}
  $candidate=Get-Content -LiteralPath $marker -Raw -Encoding UTF8|ConvertFrom-Json
  $cfg=Read-Env
  $installed=Get-VenueInstalledWebSha $State $cfg
  $installedApi=Get-VenueRuntimeApiSha $cfg
  if($candidate.stage -cne $State.stageId -or $candidate.fingerprint -cne $State.fingerprint -or
    $candidate.from -cne $installed -or $candidate.fromApi -cne $installedApi -or
    ($candidate.target -ceq $installed -and $candidate.target -ceq $installedApi) -or
    [string]$candidate.target -cnotmatch '^[a-f0-9]{40}\z'){return}
  if(Test-VenueStartupImage 'frontend' $candidate.target){return [string]$candidate.target}
 }catch{return}
}
# Compare schema and every migration byte from the immutable images; this
# deliberately refuses even additive schema changes in an unattended upgrade.
function Get-VenueApiSchemaFingerprint([string]$Sha){
 if($Sha -cnotmatch '^[a-f0-9]{40}\z'){return}
 $program=@'
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const sha=process.argv[2],root="/app/prisma";
if(JSON.parse(fs.readFileSync("/app/usd-release.json","utf8")).revision!==sha)process.exit(2);
const files=["schema.prisma"];
function walk(dir){
 for(const item of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){
  const rel=dir+"/"+item.name;
  if(item.isDirectory())walk(rel);
  else if(item.isFile())files.push(rel);
  else process.exit(3);
 }
}
walk("migrations");
if(!files.some(file=>file.endsWith("/migration.sql")))process.exit(4);
const manifest=files.sort().map(file=>[file,crypto.createHash("sha256").update(fs.readFileSync(path.join(root,file))).digest("hex")]);
console.log(crypto.createHash("sha256").update(JSON.stringify(manifest)).digest("hex"));
'@
 try{
  $image='ghcr.io/kolyagazha89/usd-2.0-api:'+$Sha
  $lines=@($program | & docker run --rm -i --network none --pull never --entrypoint node $image - $Sha 2>$null)
  if($LASTEXITCODE -eq 0 -and $lines.Count -eq 1 -and [string]$lines[0] -cmatch '^[a-f0-9]{64}\z'){return [string]$lines[0]}
 }catch{return}
}
function Test-VenueStageUnchanged([object]$State){
 if([string]$State.stageId -cnotmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z'){return $false}
 # Called after the installed journal has been checked; missing table, failed
 # query or an unexpected result is a hard refusal, not an empty journal.
 try{
  $query="SELECT NOT EXISTS(SELECT 1 FROM venue_private.operation_journal WHERE stage_id='$($State.stageId)')"
  $lines=@(& docker @(Get-VenueComposeArguments) exec -T db psql -X -A -t -v 'ON_ERROR_STOP=1' -U usd_venue_root -d usd_venue -c $query 2>$null)
  return $LASTEXITCODE -eq 0 -and $lines.Count -eq 1 -and [string]$lines[0] -ceq 't'
 }catch{return $false}
}
function Update-VenueCachedRuntime([object]$State,[string]$Target){
 if($Target -cne (Get-VenueCachedWebTarget $State)){return 'not-eligible'}
 $cfg=Read-Env
 $installedApi=Get-VenueRuntimeApiSha $cfg
 $installedWeb=Get-VenueInstalledWebSha $State $cfg
 if($Target -ceq $installedApi -or !(Test-VenueStartupImage 'api' $Target)){return 'not-eligible'}
 Set-VenueStep 'check-startup-schema'
 try{
  $oldSchema=Get-VenueApiSchemaFingerprint $installedApi
  $newSchema=Get-VenueApiSchemaFingerprint $Target
  if(!$oldSchema -or $oldSchema -cne $newSchema -or !(Test-VenueStageUnchanged $State)){
   Write-Host 'USD VENUE: API оставлен без изменений (иная схема или локальные операции).'
   return 'not-eligible'
  }
  Assert-VenueReleaseImages $Target
 }catch{
  Write-Warning 'Совместимость нового API не подтверждена. Оставляем установленную версию.'
  return 'not-eligible'
 }
 $original=[IO.File]::ReadAllText($EnvFile)
 $newline=[Environment]::NewLine
 $lines=@([IO.File]::ReadAllLines($EnvFile)|Where-Object {$_ -notmatch '^VENUE_(API|WEB)_IMAGE_TAG='})
 $updated=($lines+@(('VENUE_API_IMAGE_TAG='+$Target),('VENUE_WEB_IMAGE_TAG='+$Target))) -join $newline
 $changed=$false
 try{
  # Only called when the operator started a previously stopped stack.
  # Stop the API before rechecking the journal to close the write race.
  Set-VenueStep 'backup-registration-upgrade'
  Invoke-Compose @('stop','api') 'pause API before automatic compatible update'
  if(!(Test-VenueStageUnchanged $State)){
   Invoke-Compose @('up','-d','--no-deps','--no-build','--pull','never','api') 'restore previous judging API'
   Wait-VenueLanReady $State
   return 'not-eligible'
  }
  Save-VenueRegistrationUpgradeBackup
  Set-VenueStep 'activate-registration-upgrade'
  Set-VenueRuntimeEnvironment ($updated+$newline)
  $changed=$true
  Invoke-Compose @('up','-d','--no-build','--no-deps','--pull','never','--force-recreate','api','frontend','gateway') 'activate cached compatible USD release'
  Wait-VenueLanReady $State
  if(!(Test-VenueWebRevision $Target)){throw 'Интерфейс не подтвердил скачанную версию'}
 }catch{
  $failure=$_.Exception.Message
  try{
   $services=@('api')
   if($changed){
    Set-VenueRuntimeEnvironment $original
    $services=@('--force-recreate','api','frontend','gateway')
   }
   Invoke-Compose (@('up','-d','--no-build','--no-deps','--pull','never')+$services) 'restore previous local services'
   Wait-VenueLanReady $State
   if(!(Test-VenueWebRevision $installedWeb)){throw 'Прежний интерфейс не подтвердил версию'}
  }catch{
   throw ('Автообновление: '+$failure+'. Откат не подтвердился: '+$_.Exception.Message)
  }
  Write-Warning ('Автообновление не выполнено, прежние версии восстановлены: '+$failure)
  return 'rolled-back'
 }
 Write-Host ('USD VENUE: автоматически обновлены API и frontend '+$Target+'; схема и данные сохранены')
 return 'updated'
}
function Update-ReadyVenueFrontend([object]$State,[string]$CachedTarget='') {
 if($State.phase -ne 'READY'){throw 'LIVE: установка этапа ещё не завершена'}
 $cfg=Read-Env
 if($cfg['VENUE_STAGE_ID'] -cne $State.stageId -or
    $cfg['VENUE_IMAGE_TAG'] -cne $State.image -or
    $cfg['VENUE_BIND_IP'] -cne $State.ip){
  throw 'LIVE: данные текущего этапа не совпадают; обновление отменено'
 }
 $installed=$(if($cfg.ContainsKey('VENUE_WEB_IMAGE_TAG')){[string]$cfg['VENUE_WEB_IMAGE_TAG']}else{[string]$State.image})
 if($installed -cnotmatch '^[a-f0-9]{40}\z'){throw 'LIVE: неверная версия установленного frontend'}
 $target=if($CachedTarget){
  if($CachedTarget -cne (Get-VenueCachedWebTarget $State)){throw 'Кеш обновления USD не подтверждён'}
  $CachedTarget
 }else{Get-OnlineVenueReleaseSha}
 # An installed READY stage already has a verified web image. Retrying its
 # installer must never restart judges' HTTPS gateway without a new revision.
 # Start-Local takes care of a genuinely stopped container separately.
 if(!$target -or $target -ceq $installed){
  Write-Host ('USD LIVE: frontend '+$installed+'; перезапуск не требуется')
  if(!$target){Write-Warning 'Версии онлайн USD недоступны: оставили установленный frontend без перезапуска.'}
  return
 }
 $original=$null
 if($target -and $target -cne $installed){
  Set-VenueStep 'download-current-frontend-image'
  $ref='ghcr.io/kolyagazha89/usd-2.0-frontend:'+$target
  if(!$CachedTarget){Invoke-Docker @('pull',$ref) 'download frontend update'}
  $labels=Read-VenueDockerLabels 'image' $ref
  if([string]$labels.'org.opencontainers.image.revision' -cne $target){
   throw 'LIVE: новый образ не соответствует версии сайта. Данные этапа сохранены.'
  }
  $original=[IO.File]::ReadAllText($EnvFile)
  $newline=[Environment]::NewLine
  $lines=@([IO.File]::ReadAllLines($EnvFile)|Where-Object {$_ -notmatch '^VENUE_WEB_IMAGE_TAG='})
  $updated=($lines+@('VENUE_WEB_IMAGE_TAG='+$target)) -join $newline
  $temp=Join-Path $Root ('.usd-frontend-'+[guid]::NewGuid().ToString('N')+'.tmp')
  try{
   Write-PrivateFile $temp ($updated+$newline)
   Move-Item -LiteralPath $temp -Destination $EnvFile -Force
  }finally{if(Test-Path -LiteralPath $temp){Remove-Item -LiteralPath $temp -Force}}
 }
 try{
  Set-VenueStep 'activate-updated-frontend'
  # No database, API, migration, media volume or new Docker service.
  # Recreate the gateway to load the revised spectator-only HTTP routing.
  Invoke-Compose @('up','-d','--no-build','--no-deps','--pull','never',
   '--force-recreate','frontend','gateway') 'activate updated LIVE and judging frontend'
  $expected=$(if($target){$target}else{$installed})
  $webReady=$false
  $revisionReady=$false
  $gatewayReady=$false
  for($attempt=0;$attempt -lt 15;$attempt++){
   $revisionReady=Test-VenueWebRevision $expected
   $gatewayReady=Test-VenueGatewayReady $State.ip
   if($revisionReady -and $gatewayReady){$webReady=$true;break}
   Start-Sleep -Seconds 1
  }
  if(!$webReady){
   $reason=@()
   if(!$revisionReady){$reason+='frontend внутри Docker не подтвердил ревизию '+$expected}
   if(!$gatewayReady){$reason+='локальный LIVE HTTP '+$State.ip+': '+$script:VenueGatewayProbeReason}
   throw ($reason -join '; ')
  }
 }catch{
  $failure=$_.Exception.Message
  if($null -ne $original){
   $temp=Join-Path $Root ('.usd-frontend-rollback-'+[guid]::NewGuid().ToString('N')+'.tmp')
   try{
    Write-PrivateFile $temp $original
    Move-Item -LiteralPath $temp -Destination $EnvFile -Force
    try{Invoke-Compose @('up','-d','--no-build','--no-deps','--pull','never',
     '--force-recreate','frontend','gateway') 'restore previous frontend'}catch{}
   }finally{if(Test-Path -LiteralPath $temp){Remove-Item -LiteralPath $temp -Force}}
  }
  throw ('LIVE: обновление экрана не выполнено: '+$failure+'. База и результаты сохранены.')
 }
 $active=$(if($target){$target}else{$installed})
 Write-Host ('USD LIVE: frontend '+$active+'; API и база без изменений')
 if(!$target){
  Write-Warning 'Обе версии USD не подтверждены: сохранили установленный frontend. Обновите при доступном интернете.'
 }
}

# Keep the main installer small and delegate the startup policy here.
function Invoke-VenueStartupImageCache {
 if(!(Test-DockerReady)){Write-Host 'USD STARTUP IMAGES: docker-unavailable';return}
 $result=Cache-VenueStartupImages (Read-State)
 Write-Host ('USD STARTUP IMAGES: '+$result)
}
function Get-VenueStartupTargetForStoppedStage([object]$State){
 # A predownloaded image must not interrupt an already running judging API.
 if(!(Test-VenueJudgingRunning)){return (Get-VenueCachedWebTarget $State)}
}
function Invoke-VenueStartupActivation([object]$State,[string]$Target){
 if(!$Target){return}
 # A failed backend rollback must escape as an error, not as a ready stage.
 $runtimeUpdate=Update-VenueCachedRuntime $State $Target
 if($runtimeUpdate -ceq 'not-eligible'){
  try{
   Update-ReadyVenueFrontend $State -CachedTarget $Target
   Wait-VenueLanReady $State
  }catch{
   Write-Warning ('Автообновление интерфейса: '+$_.Exception.Message)
   # Do not report a working stage unless restored services actually answer.
   Wait-VenueLanReady $State
  }
 }
}
