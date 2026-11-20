#requires -Version 5.1
# Replays the real database-start helper on Windows without touching Docker Desktop.
# The regressions model a partial setup with a persisted .env and state file.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'venue-control.ps1') -Action install
$project='usd-venue-c510f67279f744eb81732a8ff94b1c0e'
$script:dbScenario=[pscustomobject]@{
 Container=$false;Running=$false;Volume=$true;Owner=$project
 Phase='SCHEMA_READY';Calls=(New-Object Collections.ArrayList)
}
function Read-State {return [pscustomobject]@{phase=$script:dbScenario.Phase}}
function Get-VenueProject {return $project}
function Get-VenueComposeArguments {return @('compose','-p',$project)}
function Read-VenueDockerLabels([string]$Kind,[string]$Identity){
 if($Kind -ne 'container'){throw 'Unexpected image lookup'}
 return [pscustomobject]@{
  'com.docker.compose.project'=$project
  'com.docker.compose.service'='db'
 }
}
function docker {
 $argLine=$args -join ' '
 $global:LASTEXITCODE=0
 if($argLine -match '^compose -p .* ps -a -q db
  if(!$script:dbScenario.Volume){$global:LASTEXITCODE=1;return}
  return ('{"com.docker.compose.project":"'+$script:dbScenario.Owner+
    '","com.docker.compose.volume":"venue_db"}')
 }
 if($argLine -match ' exec -T db pg_isready '){
  if(!$script:dbScenario.Running){$global:LASTEXITCODE=1}
  return
 }
 throw ('Unexpected Docker command: '+$argLine)
}
function Invoke-Compose([string[]]$Arguments,[string]$Purpose){
 $value=$Arguments -join ' '
 [void]$script:dbScenario.Calls.Add($value)
 if($value -eq 'start db'){
  if(!$script:dbScenario.Container){throw 'service "db" has no container to start'}
  $script:dbScenario.Running=$true
  return
 }
 if($value -eq 'up -d --no-deps --no-build --no-recreate --pull never db'){
  if(!$script:dbScenario.Volume){throw 'Created empty volume in a progressed stage'}
  $script:dbScenario.Container=$true
  $script:dbScenario.Running=$true
  return
 }
 throw ('Unexpected Compose operation: '+$value)
}
function Reset-DbScenario([bool]$Container,[bool]$Running,[bool]$Volume,[string]$Owner){
 $script:dbScenario.Container=$Container
 $script:dbScenario.Running=$Running
 $script:dbScenario.Volume=$Volume
 $script:dbScenario.Owner=$Owner
 $script:dbScenario.Calls.Clear()
}
# Exact screenshot: schema imported before, container removed, named DB volume remains.
Reset-DbScenario $false $false $true $project
Start-VenueDatabase
if(!$script:dbScenario.Running -or
 ($script:dbScenario.Calls -join ';') -cne 'up -d --no-deps --no-build --no-recreate --pull never db'){
 throw 'Resume after removed DB container failed to reattach its existing volume'
}
# Repeated install must neither recreate nor change the previously running DB.
Reset-DbScenario $true $true $true $project
Start-VenueDatabase
if($script:dbScenario.Calls.Count -ne 0){throw 'Healthy DB was unnecessarily restarted'}
# A stopped, owned container may be started without Compose up.
Reset-DbScenario $true $false $true $project
Start-VenueDatabase
if(($script:dbScenario.Calls -join ';') -cne 'start db'){throw 'Stopped DB was unnecessarily recreated'}
# Later installation phases may never silently initialize an empty database.
Reset-DbScenario $false $false $false $project
$blocked=$false
try{Start-VenueDatabase}catch{$blocked=$true}
if(!$blocked -or $script:dbScenario.Calls.Count -gt 0){throw 'Missing database volume triggered destructive recreation'}
# A similarly-named Docker volume belonging to another stage is never mounted.
Reset-DbScenario $false $false $true 'usd-venue-ffffffffffffffffffffffffffffffff'
$blocked=$false
try{Start-VenueDatabase}catch{$blocked=$true}
if(!$blocked -or $script:dbScenario.Calls.Count -gt 0){throw 'Foreign database volume was accepted'}
Write-Host 'USD WINDOWS DATABASE REPLAY PASS: missing container recovery, healthy/noop, stopped/start, missing/foreign volume refusal'
){
  if($script:dbScenario.Container){return 'abcdef123456'}else{return}
 }
 if($argLine -match '^compose -p .* ps --status running -q db
  if(!$script:dbScenario.Volume){$global:LASTEXITCODE=1;return}
  return ('{"com.docker.compose.project":"'+$script:dbScenario.Owner+
    '","com.docker.compose.volume":"venue_db"}')
 }
 if($argLine -match ' exec -T db pg_isready '){
  if(!$script:dbScenario.Running){$global:LASTEXITCODE=1}
  return
 }
 throw ('Unexpected Docker command: '+$argLine)
}
function Invoke-Compose([string[]]$Arguments,[string]$Purpose){
 $value=$Arguments -join ' '
 [void]$script:dbScenario.Calls.Add($value)
 if($value -eq 'start db'){
  if(!$script:dbScenario.Container){throw 'service "db" has no container to start'}
  $script:dbScenario.Running=$true
  return
 }
 if($value -eq 'up -d --no-deps --no-build --no-recreate --pull never db'){
  if(!$script:dbScenario.Volume){throw 'Created empty volume in a progressed stage'}
  $script:dbScenario.Container=$true
  $script:dbScenario.Running=$true
  return
 }
 throw ('Unexpected Compose operation: '+$value)
}
function Reset-DbScenario([bool]$Container,[bool]$Running,[bool]$Volume,[string]$Owner){
 $script:dbScenario.Container=$Container
 $script:dbScenario.Running=$Running
 $script:dbScenario.Volume=$Volume
 $script:dbScenario.Owner=$Owner
 $script:dbScenario.Calls.Clear()
}
# Exact screenshot: schema imported before, container removed, named DB volume remains.
Reset-DbScenario $false $false $true $project
Start-VenueDatabase
if(!$script:dbScenario.Running -or
 ($script:dbScenario.Calls -join ';') -cne 'up -d --no-deps --no-build --no-recreate --pull never db'){
 throw 'Resume after removed DB container failed to reattach its existing volume'
}
# Repeated install must neither recreate nor change the previously running DB.
Reset-DbScenario $true $true $true $project
Start-VenueDatabase
if($script:dbScenario.Calls.Count -ne 0){throw 'Healthy DB was unnecessarily restarted'}
# A stopped, owned container may be started without Compose up.
Reset-DbScenario $true $false $true $project
Start-VenueDatabase
if(($script:dbScenario.Calls -join ';') -cne 'start db'){throw 'Stopped DB was unnecessarily recreated'}
# Later installation phases may never silently initialize an empty database.
Reset-DbScenario $false $false $false $project
$blocked=$false
try{Start-VenueDatabase}catch{$blocked=$true}
if(!$blocked -or $script:dbScenario.Calls.Count -gt 0){throw 'Missing database volume triggered destructive recreation'}
# A similarly-named Docker volume belonging to another stage is never mounted.
Reset-DbScenario $false $false $true 'usd-venue-ffffffffffffffffffffffffffffffff'
$blocked=$false
try{Start-VenueDatabase}catch{$blocked=$true}
if(!$blocked -or $script:dbScenario.Calls.Count -gt 0){throw 'Foreign database volume was accepted'}
Write-Host 'USD WINDOWS DATABASE REPLAY PASS: missing container recovery, healthy/noop, stopped/start, missing/foreign volume refusal'
){
  if($script:dbScenario.Running){return 'abcdef123456'}else{return}
 }
 if($argLine -match '^volume inspect'){
  if(!$script:dbScenario.Volume){$global:LASTEXITCODE=1;return}
  return ('{"com.docker.compose.project":"'+$script:dbScenario.Owner+
    '","com.docker.compose.volume":"venue_db"}')
 }
 if($argLine -match ' exec -T db pg_isready '){
  if(!$script:dbScenario.Running){$global:LASTEXITCODE=1}
  return
 }
 throw ('Unexpected Docker command: '+$argLine)
}
function Invoke-Compose([string[]]$Arguments,[string]$Purpose){
 $value=$Arguments -join ' '
 [void]$script:dbScenario.Calls.Add($value)
 if($value -eq 'start db'){
  if(!$script:dbScenario.Container){throw 'service "db" has no container to start'}
  $script:dbScenario.Running=$true
  return
 }
 if($value -eq 'up -d --no-deps --no-build --no-recreate --pull never db'){
  if(!$script:dbScenario.Volume){throw 'Created empty volume in a progressed stage'}
  $script:dbScenario.Container=$true
  $script:dbScenario.Running=$true
  return
 }
 throw ('Unexpected Compose operation: '+$value)
}
function Reset-DbScenario([bool]$Container,[bool]$Running,[bool]$Volume,[string]$Owner){
 $script:dbScenario.Container=$Container
 $script:dbScenario.Running=$Running
 $script:dbScenario.Volume=$Volume
 $script:dbScenario.Owner=$Owner
 $script:dbScenario.Calls.Clear()
}
# Exact screenshot: schema imported before, container removed, named DB volume remains.
Reset-DbScenario $false $false $true $project
Start-VenueDatabase
if(!$script:dbScenario.Running -or
 ($script:dbScenario.Calls -join ';') -cne 'up -d --no-deps --no-build --no-recreate --pull never db'){
 throw 'Resume after removed DB container failed to reattach its existing volume'
}
# Repeated install must neither recreate nor change the previously running DB.
Reset-DbScenario $true $true $true $project
Start-VenueDatabase
if($script:dbScenario.Calls.Count -ne 0){throw 'Healthy DB was unnecessarily restarted'}
# A stopped, owned container may be started without Compose up.
Reset-DbScenario $true $false $true $project
Start-VenueDatabase
if(($script:dbScenario.Calls -join ';') -cne 'start db'){throw 'Stopped DB was unnecessarily recreated'}
# Later installation phases may never silently initialize an empty database.
Reset-DbScenario $false $false $false $project
$blocked=$false
try{Start-VenueDatabase}catch{$blocked=$true}
if(!$blocked -or $script:dbScenario.Calls.Count -gt 0){throw 'Missing database volume triggered destructive recreation'}
# A similarly-named Docker volume belonging to another stage is never mounted.
Reset-DbScenario $false $false $true 'usd-venue-ffffffffffffffffffffffffffffffff'
$blocked=$false
try{Start-VenueDatabase}catch{$blocked=$true}
if(!$blocked -or $script:dbScenario.Calls.Count -gt 0){throw 'Foreign database volume was accepted'}
Write-Host 'USD WINDOWS DATABASE REPLAY PASS: missing container recovery, healthy/noop, stopped/start, missing/foreign volume refusal'
