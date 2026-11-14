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
# A Private hotspot must be allowed to request exactly one elevated,
# narrowly-scoped firewall rule, and a replay must never prompt again.
$script:firewallNetworkCategory='Private'
$script:firewallRule=$null
$script:firewallElevationCalls=0
function Get-NetConnectionProfile {
 param([int]$InterfaceIndex,[string]$ErrorAction)
 [pscustomobject]@{NetworkCategory=$script:firewallNetworkCategory;InterfaceIndex=11}
}
function Get-NetFirewallRule {
 param([string]$DisplayName,[string]$ErrorAction)
 if($script:firewallRule){return $script:firewallRule}
}
function Get-NetFirewallPortFilter {
 [CmdletBinding()]
 param([Parameter(ValueFromPipeline=$true)]$InputObject)
 process { [pscustomobject]@{Protocol='TCP';LocalPort='443'} }
}
function Get-NetFirewallAddressFilter {
 [CmdletBinding()]
 param([Parameter(ValueFromPipeline=$true)]$InputObject)
 process { [pscustomobject]@{LocalAddress='192.168.25.10';RemoteAddress='LocalSubnet'} }
}
function Start-Process {
 param([string]$FilePath,[string]$Verb,[string]$ArgumentList,[switch]$Wait,[switch]$PassThru)
 $script:firewallElevationCalls++
 if($Verb -ne 'RunAs' -or $ArgumentList -notmatch 'venue-firewall.ps1' -or
    $ArgumentList -notmatch '192.168.25.10' -or
    $ArgumentList -match 'AllowPrivateProfile'){
  throw 'Unsafe elevation arguments for a Private LAN'
 }
 $script:firewallRule=[pscustomobject]@{Enabled='True';Direction='Inbound';Action='Allow';Profile='Private'}
 [pscustomobject]@{ExitCode=0}
}
Ensure-Firewall '192.168.25.10'
if($script:firewallElevationCalls -ne 1){throw 'Safe Private LAN did not perform exactly one UAC setup'}
Ensure-Firewall '192.168.25.10'
if($script:firewallElevationCalls -ne 1){throw 'Private LAN setup should be idempotent on replay'}

# A stale rule left by earlier attempts must be repaired through the
# elevated helper; don't force the venue operator to manually delete it.
$script:firewallRule=[pscustomobject]@{Enabled='True';Direction='Inbound';Action='Block';Profile='Private'}
function Start-Process {
 param([string]$FilePath,[string]$Verb,[string]$ArgumentList,[switch]$Wait,[switch]$PassThru)
 $script:firewallElevationCalls++
 if($Verb -ne 'RunAs' -or $ArgumentList -notmatch 'venue-firewall.ps1' -or
    $ArgumentList -notmatch '192.168.25.10' -or $ArgumentList -match 'AllowPrivateProfile'){
  throw 'Unsafe elevation arguments while repairing stale venue rule'
 }
 $script:firewallRule=[pscustomobject]@{Enabled='True';Direction='Inbound';Action='Allow';Profile='Private'}
 [pscustomobject]@{ExitCode=0}
}
Ensure-Firewall '192.168.25.10'
if($script:firewallElevationCalls -ne 2){
 throw 'Stale USD firewall rule was not automatically repaired through UAC'
}
Ensure-Firewall '192.168.25.10'
if($script:firewallElevationCalls -ne 2){
 throw 'Repaired rule must not trigger repeated UAC'
}
$script:firewallRule=$null

# If elevated Windows rejects TCP 443, show a specific actionable reason,
# not the old generic error that forced repeated blind user retries.
function Start-Process {
 param([string]$FilePath,[string]$Verb,[string]$ArgumentList,[switch]$Wait,[switch]$PassThru)
 $script:firewallElevationCalls++
 [pscustomobject]@{ExitCode=22}
}
$failedRule=''
try { Ensure-Firewall '192.168.25.10' }catch{ $failedRule=$_.Exception.Message }
if($failedRule -notmatch '443|брандмауэр'){
 throw 'Failed Windows firewall elevation did not explain TCP 443 failure'
}
# Exercise the ACTUAL elevated firewall script on native Windows PowerShell
# using mocked NetSecurity cmdlets in a separate process (zero system writes).
$helper=Join-Path $PSScriptRoot 'venue-firewall.ps1'
$simulation=@'
$ErrorActionPreference='Stop'
$global:ruleState='stale'
$global:expectedName='USD Venue HTTPS 192.168.25.10'
function Get-NetIPAddress {
 param([string]$AddressFamily)
 [pscustomobject]@{IPAddress='192.168.25.10';InterfaceIndex=11;AddressState='Preferred'}
}
function Get-NetConnectionProfile {
 param([int]$InterfaceIndex,[string]$ErrorAction)
 [pscustomobject]@{NetworkCategory='Private'}
}
function Get-NetFirewallRule {
 param([string]$DisplayName,[string]$ErrorAction)
 if($DisplayName -ne $global:expectedName){throw 'Touched unrelated firewall rule'}
 if($global:ruleState -eq 'stale'){
  [pscustomobject]@{DisplayName=$DisplayName;Enabled='True';Direction='Inbound';Action='Block';Profile='Private'}
 }elseif($global:ruleState -eq 'safe'){
  [pscustomobject]@{DisplayName=$DisplayName;Enabled='True';Direction='Inbound';Action='Allow';Profile='Private'}
 }
}
function Remove-NetFirewallRule {
 [CmdletBinding()]
 param([Parameter(Mandatory=$true)]$InputObject)
 if($InputObject.DisplayName -ne $global:expectedName -or $global:ruleState -ne 'stale'){
  throw 'Removed wrong rule or performed a redundant deletion'
 }
 $global:ruleState='absent'
}
function New-NetFirewallRule {
 [CmdletBinding()]
 param([string]$DisplayName,[string]$Direction,[string]$Action,[string]$Enabled,
  [string]$Profile,[string]$Protocol,[string]$LocalPort,[string]$LocalAddress,
  [string]$RemoteAddress)
 if($global:ruleState -ne 'absent' -or $DisplayName -ne $global:expectedName -or
  $Direction -ne 'Inbound' -or $Action -ne 'Allow' -or $Profile -ne 'Private' -or
  $Protocol -ne 'TCP' -or $LocalPort -ne '443' -or
  $LocalAddress -ne '192.168.25.10' -or $RemoteAddress -ne 'LocalSubnet'){
  throw 'Unsafe or incorrect replacement firewall rule'
 }
 $global:ruleState='safe'
 [pscustomobject]@{DisplayName=$DisplayName}
}
function Get-NetFirewallPortFilter {
 [CmdletBinding()]
 param([Parameter(ValueFromPipeline=$true)]$InputObject)
 process { [pscustomobject]@{Protocol='TCP';LocalPort='443'} }
}
function Get-NetFirewallAddressFilter {
 [CmdletBinding()]
 param([Parameter(ValueFromPipeline=$true)]$InputObject)
 process { [pscustomobject]@{LocalAddress='192.168.25.10';RemoteAddress='LocalSubnet'} }
}
& '__FIREWALL_SCRIPT__' -Ip '192.168.25.10'
'@
$simulation=$simulation.Replace('__FIREWALL_SCRIPT__',$helper.Replace("'","''"))
$encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($simulation))
& powershell.exe -NoProfile -NonInteractive -EncodedCommand $encoded | Out-Host
if($LASTEXITCODE -ne 0){throw 'Elevated firewall helper could not safely repair an old USD rule'}
Write-Host 'Windows helper runtime tests passed; no Docker, firewall or database was modified.'
