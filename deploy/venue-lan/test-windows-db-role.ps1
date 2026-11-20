#requires -Version 5.1
# Real PowerShell 5.1, mocked read-only Docker boundary; no data changes.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'venue-control.ps1') -Action install
$script:RoleRows=@('false|true')
$script:RoleExit=0
$script:Calls=0
function Get-VenueComposeArguments {return @('compose','-p','usd-venue-diagnostic-test')}
function docker {
 $flat=@()
 foreach($item in $args){
  if($item -is [array]){foreach($part in $item){$flat+=([string]$part)}}
  else{$flat+=([string]$item)}
 }
 $call=$flat -join ' '
 if($call -notmatch 'exec -T db psql -X -A -t -v ON_ERROR_STOP=1 -U usd_venue_root -d usd_venue -c SELECT COALESCE'){
  throw ('Unexpected write command in readonly role check: '+$call)
 }
 $script:Calls++
 $global:LASTEXITCODE=$script:RoleExit
 return $script:RoleRows
}
Assert-VenueDatabaseImportRole
if($script:Calls -ne 1){throw 'Role read was not executed exactly once'}
foreach($case in @(
 @{rows=@('true|true');code='DATABASE_UNSAFE_SUPERUSER_ROLE'},
 @{rows=@('missing|true');code='DATABASE_APP_ROLE_MISSING'},
 @{rows=@('false|false');code='DATABASE_ROLE_MISMATCH'},
 @{rows=@('bad');code='DATABASE_ROLE_MISMATCH'}
)){
 $script:RoleRows=$case.rows
 $errorText=''
 try{Assert-VenueDatabaseImportRole}catch{$errorText=[string]$_.Exception.Message}
 if($errorText -notmatch $case.code){throw ('Role mismatch was not refused: '+$case.code)}
}
$script:RoleRows=@()
$blocked=$false
try{Assert-VenueDatabaseImportRole}catch{$blocked=$true}
if(!$blocked){throw 'Empty DB role query was accepted'}
$script:RoleRows=@('false|true')
$script:RoleExit=1
$blocked=$false
try{Assert-VenueDatabaseImportRole}catch{$blocked=$true}
if(!$blocked){throw 'Failed psql query was accepted'}
Write-Host 'USD WINDOWS DB ROLE PREFLIGHT PASS: least privilege required, missing/unsafe roles rejected, no writes'
