#requires -Version 5.1
# Append a signed participant directory to the existing isolated LAN DB.
# Never change registrations, results, stage baseline or historical journal.
function Import-VenueParticipantDirectory {
 if($Silent){throw 'Обновление справочника требует администратора'}
 Set-VenueStep 'import-existing-participant-directory'
 Assert-VenueCompose
 Ensure-DockerReady
 $state=Read-State
 if(!$state -or $state.phase -ne 'READY'){throw 'Сначала завершите установку USD'}
 $cfg=Read-Env
 if($cfg['VENUE_STAGE_ID'] -cne [string]$state.stageId -or
   $cfg['VENUE_SIGNING_KEY_FINGERPRINT'] -cne [string]$state.fingerprint){
  throw 'Локальный этап или его доверенная подпись изменились'
 }
 $file=$(if($StageFile){$StageFile}else{Select-VenueFile 'Новый подписанный пакет этого же этапа со всеми участниками' 'Пакет этапа (*.json)|*.json'})
 if(!(Test-Path -LiteralPath $file -PathType Leaf)){throw 'Файл пакета отсутствует'}
 if((Get-Item -LiteralPath $file).Length -gt (12*1024*1024+256*1024)){throw 'Пакет слишком большой'}
 $signed=Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json
 if([string]$signed.snapshot.stageId -cne [string]$state.stageId){throw 'Пакет другого этапа. Данные не изменены.'}
 if([string]$signed.integrity.publicKeyFingerprint -cne [string]$state.fingerprint){throw 'Недоверенный ключ подписания.'}
 if($null -eq $signed.snapshot.participantDirectory){throw 'Нет полного справочника. Скачайте свежий пакет на основном USD.'}
 if(!(Test-Path -LiteralPath $state.publicKey -PathType Leaf)){throw 'Нет доверенного открытого ключа USD'}
 Start-VenueDatabase
 if(-not(Test-IsActiveVenueStage $state.stageId)){throw 'Нельзя обновить исторический этап'}
 $api=@(& docker @(Get-VenueComposeArguments) ps --status running -q api)
 Assert-Exit 'inspect venue judging state'
 $wasRunning=@($api | Where-Object {$_ -match '^[a-f0-9]{12,64}$'}).Count -gt 0
 $paused=$false
 $originalDb=$env:DATABASE_URL;$originalPass=$env:VENUE_DB_PASSWORD
 $base=[Environment]::GetFolderPath('LocalApplicationData')
 if([string]::IsNullOrWhiteSpace($base)){throw 'Защищённая локальная папка резервных копий недоступна'}
 $backupDir=Join-Path (Join-Path $base 'USD-Venue') 'db-backups'
 if(!(Test-Path -LiteralPath $backupDir)){New-Item -ItemType Directory -Path $backupDir -Force|Out-Null}
 $acl=New-Object System.Security.AccessControl.DirectorySecurity
 $acl.SetAccessRuleProtection($true,$false)
 $user=[System.Security.Principal.WindowsIdentity]::GetCurrent().User
 $grant=New-Object System.Security.AccessControl.FileSystemAccessRule($user,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
 $acl.AddAccessRule($grant)
 [IO.Directory]::SetAccessControl($backupDir,$acl)
 $nonce=[guid]::NewGuid().ToString('N')
 $dump='/tmp/usd-venue-directory-'+$nonce+'.dump'
 $backup=Join-Path $backupDir ('usd-before-directory-'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')+'-'+$nonce+'.dump')
 try{
  if($wasRunning){Invoke-Compose @('stop','api') 'pause judging during directory update';$paused=$true}
  Invoke-Compose @('exec','-T','db','pg_dump','-U','usd_venue_root','-d','usd_venue','--format=custom','--file',$dump) 'backup LAN database'
  Invoke-Compose @('exec','-T','db','pg_restore','--list',$dump) 'verify LAN backup'
  $originalHash=@(& docker @(Get-VenueComposeArguments) exec -T db sha256sum $dump)
  Assert-Exit 'checksum source venue database backup'
  $sourceSha=@($originalHash|Where-Object {$_ -match '^[a-f0-9]{64}\s+'})
  if($sourceSha.Count -ne 1){throw 'Нет подтверждённой SHA256 копии внутри PostgreSQL'}
  $expectedSha=([string]$sourceSha[0]).Substring(0,64).ToUpperInvariant()
  $ids=@(& docker @(Get-VenueComposeArguments) ps -q db)
  Assert-Exit 'identify LAN db container'
  $ids=@($ids | Where-Object {$_ -match '^[a-f0-9]{12,64}$'})
  if($ids.Count -ne 1){throw 'Не подтверждён единственный контейнер БД'}
  Invoke-Docker @('cp',([string]$ids[0]+':'+$dump),$backup) 'copy backup to protected Windows folder'
  if(!(Test-Path -LiteralPath $backup -PathType Leaf) -or (Get-Item -LiteralPath $backup).Length -lt 1024){
   throw 'Резервная копия отсутствует. Импорт не начат.'
  }
  $copiedHash=(Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash
  if($copiedHash -cne $expectedSha){
   throw 'backup checksum differs: копия Windows отличается от проверенной копии PostgreSQL'
  }
  Write-Host ('USD VENUE BACKUP: '+$backup)
  $env:VENUE_DB_PASSWORD=$cfg['VENUE_DB_ROOT_PASSWORD']
  $env:DATABASE_URL='postgresql://usd_venue_root:'+$cfg['VENUE_DB_ROOT_PASSWORD']+'@db:5432/usd_venue?schema=public'
  $mounts=@('--volume',($file+':/app/venue-directory-package.json:ro'),
   '--volume',([string]$state.publicKey+':/app/venue-signing-public.pem:ro'),
   '--volume',((Join-Path $Root 'import-stage.mjs')+':/app/import-stage.mjs:ro'),
   '--volume',((Join-Path $Root 'verify-stage-package.mjs')+':/app/verify-stage-package.mjs:ro'))
  Invoke-Compose (@('run','--rm','--no-deps','-T','-e','DATABASE_URL',
   '-e','VENUE_DB_USER=usd_venue_root','-e','VENUE_DB_PASSWORD')+$mounts+
   @('--entrypoint','node','api','/app/import-stage.mjs',
   '/app/venue-directory-package.json','/app/venue-signing-public.pem','--apply-directory')) 'import signed existing profiles'
 }finally{
  if($null -eq $originalDb){Remove-Item Env:\DATABASE_URL -ErrorAction SilentlyContinue}
  else{$env:DATABASE_URL=$originalDb}
  if($null -eq $originalPass){Remove-Item Env:\VENUE_DB_PASSWORD -ErrorAction SilentlyContinue}
  else{$env:VENUE_DB_PASSWORD=$originalPass}
  $null=& docker @(Get-VenueComposeArguments) exec -T db rm -f $dump 2>$null
  if($paused){Restore-VenueApi}
 }
 Show-VenueMessage 'Все профили и автомобили из подписанного справочника загружены. ID сохранены, результаты и регистрации не изменены.'
}
