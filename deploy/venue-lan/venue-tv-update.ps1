#requires -Version 5.1
# Operator-controlled TV frontend update. Existing API, database and media stay running.
function Update-VenueTV {
 $target='6a9856170c2cc26b011225b2f76c89366d6bb7c2'
 Set-VenueStep 'validate-TV-update-current-stage'
 $state=Read-State
 if(!$state -or $state.phase -ne 'READY' -or
  ($state.PSObject.Properties.Name -contains 'demo' -and $state.demo -eq $true)){
  throw 'Сначала завершите установку настоящего этапа USD.'
 }
 $cfg=Read-Env
 if($cfg['VENUE_STAGE_ID'] -cne [string]$state.stageId -or
    $cfg['VENUE_IMAGE_TAG'] -cne [string]$state.image -or
    $cfg['VENUE_SIGNING_KEY_FINGERPRINT'] -cne [string]$state.fingerprint){
  throw 'Локальный этап или конфигурация не совпадают. Обновление LIVE отменено.'
 }
 Ensure-DockerReady
 if(-not(Test-IsActiveVenueStage $state.stageId)){
  throw 'Этот этап исторический. Обновите LIVE из папки действующего этапа.'
 }
 $previous=$(if($cfg.ContainsKey('VENUE_FRONTEND_IMAGE_TAG')){
  [string]$cfg['VENUE_FRONTEND_IMAGE_TAG']
 }else{[string]$cfg['VENUE_IMAGE_TAG']})
 if($previous -ceq $target){
  Write-Host 'USD LIVE: телевизионная версия уже установлена.'
  if(!$Silent){Show-VenueMessage 'Телевизионный LIVE уже обновлён.'}
  return
 }
 $ref='ghcr.io/kolyagazha89/usd-2.0-frontend:'+$target
 Set-VenueStep 'download-TV-frontend-image'
 $id=@()
 try{$id=@(& docker image inspect --format '{{.ID}}' $ref 2>$null)}catch{}
 if($LASTEXITCODE -ne 0 -or $id.Count -ne 1 -or [string]::IsNullOrWhiteSpace([string]$id[0])){
  Invoke-Docker @('pull',$ref) 'download TV frontend image'
 }
 $labels=Read-VenueDockerLabels 'image' $ref
 if([string]$labels.'org.opencontainers.image.revision' -cne $target){
  throw 'Версия Docker-образа LIVE не совпадает с опубликованным релизом. Ничего не изменено.'
 }
 $oldEnv=[IO.File]::ReadAllText($EnvFile)
 $line='VENUE_FRONTEND_IMAGE_TAG='+$target
 $newEnv=$(if($cfg.ContainsKey('VENUE_FRONTEND_IMAGE_TAG')){
  [regex]::Replace($oldEnv,'(?m)^VENUE_FRONTEND_IMAGE_TAG=[^\r\n]*',$line)
 }else{
  $oldEnv.TrimEnd([char[]]@("`r","`n"))+[Environment]::NewLine+$line+[Environment]::NewLine
 })
 $temp=Join-Path $Root ('.venue-tv-'+[guid]::NewGuid().ToString('N')+'.tmp')
 $restore=Join-Path $Root ('.venue-tv-restore-'+[guid]::NewGuid().ToString('N')+'.tmp')
 $changed=$false
 try{
  [IO.File]::WriteAllText($temp,$newEnv,(New-Object Text.UTF8Encoding($false)))
  [IO.File]::Replace($temp,$EnvFile,$null)
  $changed=$true
  Set-VenueStep 'recreate-only-frontend-container'
  Invoke-Compose @('up','-d','--no-deps','--no-build','--pull','never','frontend') 'replace TV frontend only'
  $running=@(& docker @(Get-VenueComposeArguments) ps --status running -q frontend)
  Assert-Exit 'inspect running TV frontend'
  if($running.Count -ne 1 -or [string]$running[0] -cnotmatch '^[a-f0-9]{12,64}$'){
   throw 'Новый LIVE-контейнер не запущен'
  }
  $active=@(& docker inspect --format '{{.Image}}' $running[0])
  Assert-Exit 'inspect active TV image'
  $expected=@(& docker image inspect --format '{{.ID}}' $ref)
  Assert-Exit 'inspect expected TV image'
  if($active.Count -ne 1 -or $expected.Count -ne 1 -or
   [string]$active[0] -cne [string]$expected[0]){throw 'Запущен неправильный LIVE-образ'}
  Write-Host ('USD LIVE: телевизионный экран обновлён до '+$target)
  Write-Host ('SPL: https://'+$state.ip+'/venue/live?screen=spl')
  Write-Host ('BFSPL и BDW SPL: https://'+$state.ip+'/venue/live?screen=bfspl-bdw')
  if(!$Silent){Show-VenueMessage ('LIVE обновлён. Данные судей и API не изменены.'+[Environment]::NewLine+
   'Откройте https://'+$state.ip+'/venue/live')}
 }catch{
  $reason=$_.Exception.Message
  if($changed){
   try{
    [IO.File]::WriteAllText($restore,$oldEnv,(New-Object Text.UTF8Encoding($false)))
    [IO.File]::Replace($restore,$EnvFile,$null)
    Invoke-Compose @('up','-d','--no-deps','--no-build','--pull','never','frontend') 'restore previous TV frontend'
   }catch{throw ('Ошибка обновления LIVE: '+$reason+'. Откат интерфейса не подтверждён: '+$_.Exception.Message)}
  }
  throw ('Обновление LIVE отменено, старая версия возвращена: '+$reason)
 }finally{
  foreach($path in @($temp,$restore)){
   if(Test-Path -LiteralPath $path){Remove-Item -LiteralPath $path -Force}
  }
 }
}
