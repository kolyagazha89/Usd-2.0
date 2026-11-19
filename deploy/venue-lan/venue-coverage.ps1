# Windows self-recovery for historical duplicate journal coverage metadata.
# Stop judging only during a one-time verified PostgreSQL backup and repair.
function Repair-VenueCoverageIfNeeded {
 $table=@(& docker @(Get-VenueComposeArguments) exec -T db psql -X -A -t -v 'ON_ERROR_STOP=1' -U usd_venue_root -d usd_venue -c "SELECT to_regclass('venue_private.journal_coverage');")
 Assert-Exit 'inspect journal coverage table'
 if(@($table | Where-Object {$_ -eq 'venue_private.journal_coverage'}).Count -eq 0){return}
 $countRows=@(& docker @(Get-VenueComposeArguments) exec -T db psql -X -A -t -v 'ON_ERROR_STOP=1' -U usd_venue_root -d usd_venue -c 'SELECT count(*), count(*) FILTER (WHERE format_version=2 AND from_sequence=0) FROM venue_private.journal_coverage')
 Assert-Exit 'inspect journal coverage data'
 $matching=@($countRows | Where-Object {$_ -match '^[0-9]+\|[0-9]+$'})
 if($matching.Count -ne 1){throw 'Служебный журнал не подтверждён; данные не изменены.'}
 $parts=([string]$matching[0]).Split('|')
 $all=[int]$parts[0];$valid=[int]$parts[1]
 if($all -le 1){return}
 if($all -ne $valid){throw 'Служебные отметки журнала различаются. Автовосстановление запрещено.'}
 $sql=Join-Path $Root 'repair-journal-coverage.sql'
 if(!(Test-Path -LiteralPath $sql -PathType Leaf)){throw 'Нет проверенного сценария восстановления. Обновите Windows-комплект USD.'}
 $destination=Join-Path $PrivateDir 'db-backups'
 if(!(Test-Path -LiteralPath $destination)){New-Item -ItemType Directory -Path $destination -Force|Out-Null}
 $acl=New-Object System.Security.AccessControl.DirectorySecurity
 $acl.SetAccessRuleProtection($true,$false)
 $identity=[System.Security.Principal.WindowsIdentity]::GetCurrent().User
 $rule=New-Object System.Security.AccessControl.FileSystemAccessRule($identity,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
 $acl.AddAccessRule($rule)
 [IO.Directory]::SetAccessControl($destination,$acl)
 $token=[guid]::NewGuid().ToString('N')
 $filename=Join-Path $destination ('usd-venue-before-journal-repair-'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')+'-'+$token+'.dump')
 $remote='/tmp/usd-venue-journal-recovery-'+$token+'.dump'
 $running=Test-VenueJudgingRunning
 $stopped=$false
 Write-Host ('USD VENUE: '+$all+' служебных записей. Сначала сохраняем резервную копию локальной БД.')
 try {
  if($running){Invoke-Compose @('stop','api') 'pause judging during journal repair';$stopped=$true}
  Invoke-Compose @('exec','-T','db','pg_dump','--format=custom','-U','usd_venue_root','-d','usd_venue','--file',$remote) 'create venue database backup'
  Invoke-Compose @('exec','-T','db','pg_restore','--list',$remote) 'verify venue database backup archive'
  $ids=@(& docker @(Get-VenueComposeArguments) ps -q db)
  Assert-Exit 'identify venue database for backup copy'
  $ids=@($ids|Where-Object {$_ -match '^[a-f0-9]{12,64}$'})
  if($ids.Count -ne 1){throw 'Не удалось подтвердить локальную базу для резервной копии'}
  Invoke-Docker @('cp',([string]$ids[0]+':'+$remote),$filename) 'copy venue database backup to Windows'
  if(!(Test-Path -LiteralPath $filename -PathType Leaf) -or (Get-Item -LiteralPath $filename).Length -lt 1024){
   throw 'Резервная копия не сохранена. Восстановление базы не выполнялось.'
  }
  $hash=(Get-FileHash -LiteralPath $filename -Algorithm SHA256).Hash
  if($hash -notmatch '^[A-F0-9]{64}$'){throw 'Не удалось проверить SHA256 резервной копии'}
  Write-Host ('USD VENUE BACKUP: '+$filename)
  Write-Host ('USD VENUE BACKUP SHA256: '+$hash)
  Get-Content -LiteralPath $sql -Raw -Encoding UTF8 |
   & docker @(Get-VenueComposeArguments) exec -T db psql -X -v 'ON_ERROR_STOP=1' -U usd_venue_root -d usd_venue
  Assert-Exit 'safely repair duplicate venue metadata'
  $rows=@(& docker @(Get-VenueComposeArguments) exec -T db psql -X -A -t -v 'ON_ERROR_STOP=1' -U usd_venue_root -d usd_venue -c 'SELECT count(*) FROM venue_private.journal_coverage')
  Assert-Exit 'verify repaired journal coverage'
  if(@($rows|Where-Object {$_ -eq '1'}).Count -ne 1){throw 'Восстановленный журнал не прошёл проверку. Резервная копия сохранена.'}
  Write-Host 'USD VENUE: служебные записи исправлены; результаты и цепочка журнала сохранены.'
 } finally {
  $null=& docker @(Get-VenueComposeArguments) exec -T db rm -f $remote 2>$null
  if($stopped){Restore-VenueApi}
 }
}
