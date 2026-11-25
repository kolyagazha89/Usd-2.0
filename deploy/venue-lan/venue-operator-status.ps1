#requires -Version 5.1

function Invoke-VenueHttpsProbe([string]$Ip,[int]$Port,[string]$Path,[string]$Ca){
 if(-not ('UsdVenue.HttpsProbe' -as [type])){
  Add-Type -Path (Join-Path $PSScriptRoot 'venue-https-probe.cs')
 }
 return [UsdVenue.HttpsProbe]::Get($Ip,$Port,$Path,$Ca)
}

function Test-VenueHttpsReady([string]$Ip,[string]$StageId,[int]$Port=443){
 $ca=Join-Path $PrivateDir 'USD-Venue-CA.crt'
 $script:VenueHttpsProbeReason='На ноутбуке отсутствует корневой сертификат площадки.'
 if(!(Test-Path -LiteralPath $ca -PathType Leaf)){return $false}

 $endpoint='/venue-api/results/venue-live'
 try{
  $data=Invoke-VenueHttpsProbe $Ip $Port $endpoint $ca
  $stage=($data|ConvertFrom-Json -ErrorAction Stop).stage
  if(!$stage -or $stage.id -cne $StageId){
   $script:VenueHttpsProbeReason='HTTPS API вернул другой этап.'
   return $false
  }

  $endpoint='/login'
  $html=Invoke-VenueHttpsProbe $Ip $Port $endpoint $ca
  if($html -notmatch '(?i)<(?:!doctype|html)'){
   $script:VenueHttpsProbeReason='HTTPS вернул неожиданный ответ страницы входа.'
   return $false
  }
  $script:VenueHttpsProbeReason=''
  return $true
 }catch{
  $errorDetail=$_.Exception.GetBaseException().Message
  $reason=switch($errorDetail){
   'TLS_IP_MISMATCH' {'Сертификат шлюза выписан на другой IP.'}
   'TLS_CA_MISMATCH' {'Сертификат шлюза не подтверждён корневым сертификатом площадки.'}
   'TLS_INVALID_CA' {'Корневой сертификат площадки повреждён.'}
   'TLS_NO_CERTIFICATE' {'Шлюз не предоставил сертификат.'}
   'Timeout' {'Шлюз не ответил за отведённое время.'}
   default {'HTTPS-запрос не завершился.'}
  }
  $script:VenueHttpsProbeReason=$reason+' '+$endpoint+' ['+$errorDetail+']'
  return $false
 }
}

function Get-VenueOperatorStatus {
 $result=[ordered]@{
  mode='empty';reason='';docker=$false;running=$false;activeStageId='';stageIds=@()
  registrations=$null;participants=$null;syncedAt='';confirmed=$false;expiredSync=$false
 }
 $previous=$ErrorActionPreference
 try{
  $state=Read-State
  if(Get-Command docker -ErrorAction SilentlyContinue){$result.docker=Test-DockerReady}
  if(!$state){return $result}
  if($state.phase -ne 'READY'){$result.mode='preparing';return $result}
  $result.mode='attention'
  $signed=Get-Content -LiteralPath $state.package -Raw -Encoding UTF8 | ConvertFrom-Json
  $result.expiredSync=([DateTimeOffset]$signed.snapshot.syncAuthorization.expiresAt) -le [DateTimeOffset]::UtcNow
  $acks=@(Get-ChildItem -LiteralPath $PrivateDir -Filter 'sync-ack-*.json' -File | Sort-Object LastWriteTimeUtc -Descending)
  foreach($file in $acks){
   $ack=Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
   if($ack.accepted -eq $true -and $ack.stageId -ceq $state.stageId -and $file.Name -ceq ('sync-ack-'+$ack.journalEndHash+'.json')){
    if(!$result.syncedAt){$result.syncedAt=[string]$ack.at}
   }
  }
  if(!$result.docker){
   $result.reason='Запустите Docker Desktop и дождитесь его готовности.'
   return $result
  }
  $cfg=Read-Env
  if($cfg['VENUE_STAGE_ID'] -cne $state.stageId -or $cfg['VENUE_BIND_IP'] -cne $state.ip){throw 'Файлы локального этапа не совпадают с настройками сервера.'}
  Assert-VenueDatabaseVolume
  Assert-VenueVolumeRetained @('venue_media','venue_ca','venue_caddy_config')
  $ErrorActionPreference='Continue'
  $compose=Get-VenueComposeArguments
  $db=@(& docker @compose ps --status running -q db 2>$null)
  Assert-Exit 'inspect running database'
  $api=@(& docker @compose ps --status running -q api 2>$null)
  Assert-Exit 'inspect running API'
  if(!$db.Count -and !$api.Count){$result.mode='ready';return $result}
  if($db.Count -ne 1){throw 'Сервер запущен частично. Локальная база недоступна.'}
  $id=$state.stageId
  $null=Get-VenueProjectForStage $id
  $sql=@"
SELECT json_build_object(
 'active',(SELECT stage_id FROM venue_private.active_stage WHERE singleton=true),
 'stages',COALESCE((SELECT json_agg(id) FROM public."Stage"),'[]'::json),
 'registrations',(SELECT count(*) FROM public."Registration" WHERE "stageId"='$id' AND status='ACTIVE'),
 'participants',(SELECT count(*) FROM public."Participant"),
 'hash',COALESCE((SELECT hash FROM venue_private.operation_journal WHERE stage_id='$id' ORDER BY sequence DESC LIMIT 1),repeat('0',64)));
"@
  $rows=@($sql | & docker @compose exec -T db psql -X -A -t -v 'ON_ERROR_STOP=1' -U usd_venue_root -d usd_venue 2>$null)
  Assert-Exit 'read local stage and journal'
  $local=($rows -join '')|ConvertFrom-Json -ErrorAction Stop
  $null=Get-VenueProjectForStage ([string]$local.active)
  $result.activeStageId=[string]$local.active
  $result.stageIds=@($local.stages)
  $result.registrations=$local.registrations
  $result.participants=$local.participants
  if([string]$local.hash -cnotmatch '^[a-f0-9]{64}$'){throw 'Локальная база не вернула контрольную сумму журнала.'}
  $ackFile=Join-Path $PrivateDir ('sync-ack-'+$local.hash+'.json')
  if(Test-Path -LiteralPath $ackFile -PathType Leaf){
   $ack=Get-Content -LiteralPath $ackFile -Raw -Encoding UTF8|ConvertFrom-Json
   $result.confirmed=$ack.accepted -eq $true -and $ack.stageId -ceq $id -and $ack.journalEndHash -ceq $local.hash
   if($result.confirmed){$result.syncedAt=[string]$ack.at}
  }
  if($result.activeStageId -cne $id){$result.mode='archived';return $result}
  if($api.Count){
   $profile=Get-VenueLanProfile $state.ip
   if([string]$profile.NetworkCategory -ne 'Private'){
    throw 'Доступ судей по Wi-Fi требует профиля Windows «Частная». Нажмите «Запустить офлайн-сервер» и проверьте настройки сети.'
   }
   if(!(Test-VenueApiReady (Get-VenueRuntimeApiSha $cfg) $id)){throw 'Локальный API не подтвердил текущий этап.'}
   if(!(Test-VenueGatewayReady $state.ip)){throw 'Локальное LIVE-табло по HTTP не отвечает.'}
   if(!(Test-VenueHttpsReady $state.ip $id)){throw $script:VenueHttpsProbeReason}
   $result.running=$true
  }
  $result.mode=if($result.confirmed -and !$result.running){'synced'}
   elseif(!$result.confirmed -and $local.hash -cne ('0'*64)){'pending'}
   elseif($result.running){'working'}else{'ready'}
 }catch{
  $result.mode='attention'
  $result.reason=$_.Exception.Message
 }finally{$ErrorActionPreference=$previous}
 return $result
}
