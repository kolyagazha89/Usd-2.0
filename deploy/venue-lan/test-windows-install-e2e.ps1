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
$script:RunningApiStage=$script:stageId
$script:ActiveDatabaseStage=$script:stageId
function Assert-VenueCompose {}
function Ensure-DockerReady {}
function Ensure-Firewall([string]$Ip){}
function Assert-NoOtherVenueGatewayRunning {}
function Assert-VenueVolumeRetained([string[]]$Names){
 [void]$script:steps.Add('check-retained-'+($Names -join ','))
}
function Test-VenueRuntimeImagesCached([string]$Sha){return $true}
function Initialize-VenueMediaVolume {[void]$script:steps.Add('prepare-media')}
function Confirm-SignedStage([object]$State){
 [void]$script:steps.Add('verify-stage')
 return @('--volume','fixture:/app/venue-stage.json:ro')
}
function Read-State {return $script:state}
function Complete-VenueInitialConfig([object]$State){}
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
 if($Arguments -contains '--force-recreate'){
  if($Arguments -notcontains '--no-deps' -or $Arguments -contains 'db' -or $Arguments -contains 'rustfs'){
   throw 'Stage activation tried to replace storage'
  }
  if($Arguments -contains 'api'){$script:RunningApiStage=$script:state.stageId}
 }
 if($Purpose -eq $script:FailOperation){
  throw ('Injected failure in '+$Purpose)
 }
}
function Assert-VenueDatabaseImportRole {[void]$script:steps.Add('verify-db-role')}
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
 if($script:FailReadiness -or $script:RunningApiStage -cne $State.stageId){throw 'Simulated API not ready'}
}
function Test-IsActiveVenueStage([string]$StageId){return $script:ActiveDatabaseStage -ceq $StageId}
function Start-Local {
 param([switch]$ActivateCachedFrontend)
 if($ActivateCachedFrontend){[void]$script:steps.Add('check-startup-update')}
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
 if($calls.IndexOf('verify-db-role') -lt 0 -or $calls.IndexOf('verify-db-role') -gt $calls.IndexOf('/app/import-stage.mjs')){
  throw 'Signed stage import bypassed read-only database privilege preflight'
 }
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
$mutations=@($script:steps|Where-Object {$_ -ne 'compose-config --quiet'})
if(($mutations -join ';') -cne 'check-startup-update;start-frontend'){
 throw ('READY retry unexpectedly modified a completed installation: '+($script:steps -join ';'))
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
# A committed switch must replace the old stage's API without replaying import or replacing storage.
$script:steps.Clear()
$script:state.phase='STAFF_READY'
$script:state.shared=$true
$script:stageId='d510f672-79f7-44eb-8173-2a8ff94b1c0e'
$script:state.stageId=$script:stageId
$script:ActiveDatabaseStage=$script:stageId
Install-Local
if($script:state.phase -ne 'READY' -or $script:RunningApiStage -cne $script:state.stageId){
 throw 'Shared installation left the obsolete stage API running'
}
$actions=$script:steps -join ';'
if($actions -notmatch 'force-recreate api frontend gateway' -or $actions -match 'migrate|signed stage import|phase-IMPORTED'){
 throw 'Shared recovery replayed the import or failed to activate the new stage'
}
$script:steps.Clear()
$script:state.phase='STAFF_READY'
$script:ActiveDatabaseStage='e510f672-79f7-44eb-8173-2a8ff94b1c0e'
$blocked=$false
try{Install-Local}catch{$blocked=$true}
if(!$blocked -or ($script:steps -join ';') -match 'force-recreate'){
 throw 'A historical workspace was allowed to restart stage services'
}
Write-Host 'USD WINDOWS INSTALL E2E PASS: clean setup, crash recovery and shared stage API recreation with retained storage'
