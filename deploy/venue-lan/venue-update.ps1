#requires -Version 5.1
# Update only the web image and HTTPS gateway; retain the judging API and data.
function Copy-VenueWebVersion([System.Collections.IDictionary]$Config,[hashtable]$Source){
 if($Source.ContainsKey('VENUE_WEB_IMAGE_TAG')){
  $version=[string]$Source['VENUE_WEB_IMAGE_TAG']
  if($version -cnotmatch '^[a-f0-9]{40}\z'){throw 'Неверная версия экрана предыдущего этапа'}
  $Config['VENUE_WEB_IMAGE_TAG']=$version
 }
}
function Test-VenueGatewayReady([string]$Ip){
 try{
  $reply=Invoke-WebRequest -Uri ('http://'+$Ip+'/venue/live') -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
  return $reply.StatusCode -eq 200 -and [string]$reply.Content -match '(?i)<(?:!doctype|html)'
 }catch{return $false}
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
function Update-ReadyVenueFrontend([object]$State) {
 if($State.phase -ne 'READY'){throw 'LIVE: установка этапа ещё не завершена'}
 $cfg=Read-Env
 if($cfg['VENUE_STAGE_ID'] -cne $State.stageId -or
    $cfg['VENUE_IMAGE_TAG'] -cne $State.image -or
    $cfg['VENUE_BIND_IP'] -cne $State.ip){
  throw 'LIVE: данные текущего этапа не совпадают; обновление отменено'
 }
 $installed=$(if($cfg.ContainsKey('VENUE_WEB_IMAGE_TAG')){[string]$cfg['VENUE_WEB_IMAGE_TAG']}else{[string]$State.image})
 if($installed -cnotmatch '^[a-f0-9]{40}\z'){throw 'LIVE: неверная версия установленного frontend'}
 $target=Get-OnlineVenueReleaseSha
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
  Invoke-Docker @('pull',$ref) 'download frontend update'
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
  for($attempt=0;$attempt -lt 15;$attempt++){
   if((Test-VenueWebRevision $expected) -and (Test-VenueGatewayReady $State.ip)){$webReady=$true;break}
   Start-Sleep -Seconds 1
  }
  if(!$webReady){throw 'Новый экран или локальный шлюз не подтвердили готовность'}
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
