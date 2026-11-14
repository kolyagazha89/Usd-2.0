#requires -Version 5.1
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'venue-control.ps1') -Action install
function docker {
 'ordinary Docker progress output'
 $global:LASTEXITCODE=0
}
$result=@(Invoke-Docker @('version') 'test')
if($result.Count -ne 0){throw 'Docker stdout polluted a function return value'}
function New-TestState {
 Invoke-Docker @('pull','fake') 'test'
 return [pscustomobject]@{phase='CONFIGURED';stageId='test'}
}
$state=New-TestState
if($state -is [array] -or $state.phase -ne 'CONFIGURED'){throw 'Setup state polluted with command output'}
function docker {$global:LASTEXITCODE=1}
$failed=$false
try{Invoke-Docker @('version') 'test'}catch{$failed=$true}
if(!$failed){throw 'Failed native command was accepted'}
# Regression: an offline installer must re-read its own .env. The
# DATABASE_URL contains a second '=' in ?schema=public; do not split
# into three parts or lose any characters of a value.
$oldEnvFile=$EnvFile
$fixtureRoot=Join-Path ([IO.Path]::GetTempPath()) ('usd-venue-env-test-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($fixtureRoot)|Out-Null
try {
 $EnvFile=Join-Path $fixtureRoot '.env'
 $expected=@(
  'VENUE_BIND_IP=192.168.10.20',
  ('VENUE_IMAGE_TAG='+('a'*40)),
  'VENUE_STAGE_ID=3beb7903-48ab-4856-a2c0-a910fb5ead13',
  'VENUE_DATABASE_URL=postgresql://usd_venue:somepass@db:5432/usd_venue?schema=public',
  'VENUE_DB_PASSWORD=somepass',
  ('VENUE_JWT_SECRET='+('b'*64))
 )
 foreach($fixtureLine in $expected){
  if([string]$fixtureLine -notmatch '^[A-Z][A-Z0-9_]*='){
   throw ('Malformed .env fixture, item length '+([string]$fixtureLine).Length)
  }
 }
 [IO.File]::WriteAllLines($EnvFile,[string[]]$expected,(New-Object Text.UTF8Encoding($false)))
 $parsed=Read-Env
 if($parsed.Count -ne $expected.Count){throw 'Generated .env was not round-tripped by Read-Env'}
 if($parsed['VENUE_DATABASE_URL'] -cne 'postgresql://usd_venue:somepass@db:5432/usd_venue?schema=public'){
  throw 'Read-Env corrupted the query string containing schema=public'
 }
 if($parsed['VENUE_BIND_IP'] -cne '192.168.10.20'){throw 'Read-Env corrupted LAN IP'}
}finally{
 $EnvFile=$oldEnvFile
 [IO.Directory]::Delete($fixtureRoot,$true)
}
# LAN firewall regression: Windows frequently classifies a new Wi-Fi as
# Public. A denied profile MUST receive a meaningful explanation without UAC
# or broadening the firewall to every public network.
$script:firewallElevationCalls=0
function Get-NetIPAddress {
 param([string]$AddressFamily)
 [pscustomobject]@{IPAddress='192.168.25.10';InterfaceIndex=11;InterfaceAlias='Judges Wi-Fi';AddressState='Preferred'}
}
function Get-NetConnectionProfile {
 param([int]$InterfaceIndex,[string]$ErrorAction)
 [pscustomobject]@{NetworkCategory='Public';InterfaceIndex=11}
}
function Get-NetFirewallRule {
 param([string]$DisplayName,[string]$ErrorAction)
 return $null
}
function Confirm-VenueAction { param([string]$Text) return $false }
function Start-Process {
 param([string]$FilePath,[string]$Verb,[string]$ArgumentList,[switch]$Wait,[switch]$PassThru)
 $script:firewallElevationCalls++
 throw 'unexpected elevation'
}
$firewallMessage=''
try { Ensure-Firewall '192.168.25.10' } catch { $firewallMessage=$_.Exception.Message }
if($firewallMessage -notmatch 'частн|Частн|Private'){
 throw 'Public Wi-Fi profile must be explained, not a generic LAN firewall failure'
}
if($script:firewallElevationCalls -ne 0){
 throw 'Do not elevate or silently trust Public Wi-Fi after declined consent'
}
Write-Host 'Windows helper runtime tests passed; no Docker, firewall or database was modified.'
