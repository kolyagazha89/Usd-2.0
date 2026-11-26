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
  Write-PrivateFile $temp (@{stage=$State.stageId;fingerprint=$State.fingerprint;from=$installed;target=$target}|ConvertTo-Json -Compress)
  if(Test-Path -LiteralPath $marker){[IO.File]::Replace($temp,$marker,[NullString]::Value)}
  else{[IO.File]::Move($temp,$marker)}
 }finally{if(Test-Path -LiteralPath $temp){Remove-Item -LiteralPath $temp -Force}}
 if($target -ceq $installed){return 'current'}
 return 'cached'
}
function Get-VenueCachedWebTarget([object]$State){
 try{
  $marker=Join-Path $PrivateDir 'startup-release.json'
  if(!(Test-Path -LiteralPath $marker -PathType Leaf)){return}
  $candidate=Get-Content -LiteralPath $marker -Raw -Encoding UTF8|ConvertFrom-Json
  $cfg=Read-Env
  $installed=Get-VenueInstalledWebSha $State $cfg
  if($candidate.stage -cne $State.stageId -or $candidate.fingerprint -cne $State.fingerprint -or
    $candidate.from -cne $installed -or $candidate.target -ceq $installed -or
    [string]$candidate.target -cnotmatch '^[a-f0-9]{40}\z'){return}
  if(Test-VenueStartupImage 'frontend' $candidate.target){return [string]$candidate.target}
 }catch{return}
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
