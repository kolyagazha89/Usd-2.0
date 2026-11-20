#requires -Version 5.1
# Execute the real Install-Local state machine from CONFIGURED to READY,
# with only its OS/DB/network boundaries replaced by deterministic fakes.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'venue-control.ps1') -Action install
$script:stageId='c510f672-79f7-44eb-8173-2a8ff94b1c0e'
$script:state=[pscustomobject]@{
 phase='CONFIGURED';stageId=$script:stageId;image=('a'*40);fingerprint=('b'*64)
 ip='192.168.25.10';shared=$false
}
$script:steps=New-Object Collections.ArrayList
$script:FailOperation=''
$script:FailReadiness=$false
$script:DbRestored=$true
function Assert-VenueCompose {}
function Ensure-DockerReady {}
function Ensure-Firewall([string]$Ip){}
function Assert-NoOtherVenueGatewayRunning {}
function Test-VenueRuntimeImagesCached([string]$Sha){return $true}
function Initialize-VenueMediaVolume {[void]$script:steps.Add('prepare-media')}
function Confirm-SignedStage([object]$State){
 [void]$script:steps.Add('verify-stage')
 return @('--volume','fixture:/app/venue-stage.json:ro')
}
function Read-State {return $script:state}
function Read-Env {
 return @{
  VENUE_STAGE_ID=$script:stageId;VENUE_IMAGE_TAG=('a'*40)
  VENUE_SIGNING_KEY_FINGERPRINT=('b'*64)
 }
}
function Set-SetupPhase([object]$State,[string]$Phase){
 $before=[array]::IndexOf($Phases,[string]$State.phase)
 $after=[array]::IndexOf($Phases,$Phase)
 if($after -ne $before+1){throw 'Installer attempted to skip or rewind durable phase'}
 $State.phase=$Phase
 [void]$script:steps.Add('phase-'+$Phase)
}
function Invoke-Compose([string[]]$Arguments,[string]$Purpose){
 $action=($Arguments -join ' ')
 [void]$script:steps.Add('compose-'+$action)
 if($Purpose -eq $script:FailOperation){
  throw ('Injected failure in '+$Purpose)
 }
}
function Start-VenueDatabase {
 if(!$script:DbRestored){throw 'Stored DB volume is missing'}
 [void]$script:steps.Add('restore-db')
}
function Create-ExistingStaff([object]$State,[array]$Mounts){
 [void]$script:steps.Add('staff')
}
function Repair-VenueCoverageIfNeeded {}
function Wait-VenueLanReady([object]$State){
 [void]$script:steps.Add('verify-ready')
 if($script:FailReadiness){throw 'Simulated API not ready'}
}
function Start-Local {
 if($script:state.phase -ne 'READY'){throw 'Frontend started before readiness was committed'}
 [void]$script:steps.Add('start-frontend')
}
function docker {
 $global:LASTEXITCODE=0
 if(($args -join ' ') -match 'SELECT to_regclass'){
  return ''
 }
}
function Reset-Installer {
 $script:state.phase='CONFIGURED'
 $script:steps.Clear()
 $script:FailOperation=''
 $script:FailReadiness=$false
}
function Assert-PhaseOrder {
 $calls=$script:steps -join ';'
 foreach($phase in @('STORAGE_READY','SCHEMA_READY','IMPORTED','JOURNAL_READY',
  'ADMIN_READY','STAFF_READY','READY')){
  if($calls -notmatch ('phase-'+$phase)){throw ('Installer missed phase '+$phase)}
 }
 if($calls.IndexOf('verify-ready') -gt $calls.IndexOf('phase-READY')){
  throw 'READY was committed before API + gateway readiness'
 }
 if($calls.IndexOf('verify-ready') -lt 0){throw 'Installer skipped readiness'}
 if($calls.IndexOf('start-frontend') -lt $calls.IndexOf('phase-READY')){
  throw 'Frontend activation preceded READY'
 }
}
# Fresh stage: all steps, complete journal and on-device startup.
Reset-Installer
Install-Local
if($script:state.phase -ne 'READY'){throw 'Fresh install never reached READY'}
Assert-PhaseOrder
# Idempotent launch cannot redo journal, migrations or installation.
$script:steps.Clear()
function Update-ReadyVenueFrontend([object]$State){[void]$script:steps.Add('web-noop')}
Install-Local
if(($script:steps -join ';') -cne 'web-noop;start-frontend'){
 throw 'READY retry unexpectedly modified a completed installation'
}
# Import crash: do not stamp IMPORTED before a transaction commits.
Reset-Installer
$script:FailOperation='signed stage import'
$blocked=$false
try{Install-Local}catch{$blocked=$true}
if(!$blocked -or $script:state.phase -ne 'SCHEMA_READY'){
 throw 'Failed signed import advanced durable setup state'
}
$script:steps.Clear()
$script:FailOperation=''
Install-Local
if($script:state.phase -ne 'READY'){throw 'Import failure could not resume'}
$after=$script:steps -join ';'
if($after -match 'prepare-media|migrate isolated DB'){
 throw 'Replaying a committed previous setup phase damaged storage/migrations'
}
# Late API/gateway crash: do not claim READY before LAN actually works.
Reset-Installer
$script:FailReadiness=$true
$blocked=$false
try{Install-Local}catch{$blocked=$true}
if(!$blocked -or $script:state.phase -ne 'STAFF_READY'){
 throw 'Unavailable API/gateway was incorrectly advertised READY'
}
$script:steps.Clear()
$script:FailReadiness=$false
Install-Local
if($script:state.phase -ne 'READY'){throw 'LAN readiness failure could not recover'}
if(($script:steps -join ';') -match 'prepare-media|migrate isolated DB|signed stage import'){
 throw 'Readiness retry repeated signed import or media migration'
}
Write-Host 'USD WINDOWS INSTALL E2E PASS: clean setup, idempotent READY, crash during import, API readiness retry'
