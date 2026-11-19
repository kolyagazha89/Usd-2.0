# Test the actual Windows PowerShell 5.1 season functions with no Docker service.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'venue-control.ps1') -Action install
$stage='c510f672-79f7-44eb-8173-2a8ff94b1c0e'
$next='d510f672-79f7-44eb-8173-2a8ff94b1c0e'
$project='usd-venue-'+$stage.Replace('-','')
if((Get-VenueProjectForStage $stage) -cne $project){throw 'Stage project UUID mapping incorrect'}
if((Get-VenueProjectForStage $next) -ceq $project){throw 'Two stages reused Docker project'}
try{
 $null=Get-VenueProjectForStage 'untrusted'
 throw 'Invalid UUID was accepted'
}catch{
 if($_.Exception.Message -eq 'Invalid UUID was accepted'){throw}
}
function Read-State {return $script:MockState}
$script:MockState=[pscustomobject]@{stageId=$stage;project=$project;home=$null}
$script:MockState|Add-Member -NotePropertyName projectStageId -NotePropertyValue $stage
$script:MockState.stageId=$next
if((Get-VenueProject) -cne $project){throw 'New stage must reuse original Compose project'}
$script:MockState.stageId=$stage
if((Get-VenueProject) -cne $project){throw 'Wrong Compose project selected'}
$script:MockState.project='usd-venue-attacker'
try{
 $null=Get-VenueProject
 throw 'Tampered project was accepted'
}catch{
 if($_.Exception.Message -eq 'Tampered project was accepted'){throw}
}
$script:MockState.project=$project
# Actual PowerShell 5.1 media boot logic, using a mocked Docker daemon.
$script:MediaCalls=New-Object System.Collections.ArrayList
$script:MediaVolumeLabels=@{
 'com.docker.compose.project'=$project
 'com.docker.compose.volume'='venue_media'
}
function Invoke-Compose([string[]]$Arguments,[string]$Purpose) {
 $null=$script:MediaCalls.Add(('compose '+($Arguments -join ' ')))
}
function Invoke-Docker([string[]]$Arguments,[string]$Purpose) {
 $null=$script:MediaCalls.Add(('docker '+($Arguments -join ' ')))
 if(($Arguments -join ' ') -notmatch '--network none --user 0:0'){
  throw 'Media permissions helper was not isolated'
 }
}
function docker {
 $global:LASTEXITCODE=0
 return ($script:MediaVolumeLabels|ConvertTo-Json -Compress)
}
Initialize-VenueMediaVolume
$calls=($script:MediaCalls -join [Environment]::NewLine)
if($calls -notmatch 'create --no-recreate rustfs' -or $calls -match 'create [^\r\n]*--no-deps'){throw 'Unsupported Compose create flags in media bootstrap'}
if($calls -notmatch '--mount type=volume,source=usd-venue-[a-f0-9]{32}_venue_media,target=/data'){
 throw 'Media helper targeted wrong Docker volume'
}
if($calls -match 'down|--volumes|prune'){throw 'Media helper tried destructive cleanup'}
$script:MediaCalls.Clear()
$script:MediaVolumeLabels['com.docker.compose.project']='other-project'
try{
 Initialize-VenueMediaVolume
 throw 'Foreign volume was accepted'
}catch{
 if($_.Exception.Message -eq 'Foreign volume was accepted'){throw}
}
if(($script:MediaCalls -join ' ') -match '^docker run'){throw 'Foreign volume received a write'}
$script:MediaVolumeLabels['com.docker.compose.project']=$project
$temp=Join-Path ([IO.Path]::GetTempPath()) ('usd-venue-season-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
$oldPrivate=$PrivateDir
$PrivateDir=$temp
try{
 $script:JournalTip=('a'*64)
 function docker {
  $global:LASTEXITCODE=0
  return $script:JournalTip
 }
 $ackPath=Join-Path $temp ('sync-ack-'+$script:JournalTip+'.json')
 $receipt=@{accepted=$true;stageId=$stage;journalEndHash=$script:JournalTip}
 [IO.File]::WriteAllText($ackPath,($receipt|ConvertTo-Json -Compress))
 if(-not(Test-VerifiedVenueAck $stage)){throw 'Matching Ubuntu acknowledgement was rejected'}
 $script:JournalTip=('b'*64)
 if(Test-VerifiedVenueAck $stage){throw 'Changed journal was mistakenly acknowledged'}
 $script:JournalTip=('a'*64)
 if(Test-VerifiedVenueAck $next){throw 'Acknowledgement from another stage was accepted'}
 $script:MockState.home=$temp
 $location=New-VenueStageWorkspace $next
 if(!(Test-Path -LiteralPath (Join-Path $location 'USD-Next-Stage.cmd'))){
  throw 'Next stage launcher absent from isolated workspace'
 }
 if(!(Test-Path -LiteralPath (Join-Path $location 'venue-season.ps1'))){
  throw 'Lifecycle helper missing from isolated workspace'
 }
 $source=Get-Content -LiteralPath (Join-Path $location 'shared-source.json') -Raw|ConvertFrom-Json
 if($source.project -cne $project){throw 'Next stage did not retain original project'}
 if(Test-Path -LiteralPath (Join-Path $location '.env')){
  throw 'Secret environment was copied between stages'
 }
 if(Test-Path -LiteralPath (Join-Path $location 'local-private')){
  throw 'Old identity and signing keys were copied to next stage'
 }
 # The actual previous workspace and state were not moved or overwritten.
 if((Get-VenueProject) -cne $project){throw 'Old stage identity unexpectedly changed'}
 Write-Host 'USD SEASON: shared project, stage-specific ACK and retained workspace passed'
}finally{
 $PrivateDir=$oldPrivate
 Remove-Item -LiteralPath $temp -Recurse -Force
}

# Historical Online must sync only that stage, without stopping current judging.
$script:MockState|Add-Member -NotePropertyName phase -NotePropertyValue 'READY'
function Export-VenueReturn {
 param([switch]$LeaveApiStopped,[switch]$Automatic)
 if(!$LeaveApiStopped -or !$Automatic){throw 'Historical sync lost automatic export options'}
 return [pscustomobject]@{stageId=$stage}
}
function Test-IsActiveVenueStage([string]$StageId){return $false}
function Sync-VenueReturn([object]$Bundle){return [pscustomobject]@{accepted=$true}}
function Invoke-Compose {throw 'Historical sync must not stop or replace current services'}
function Remove-Autostart {throw 'Historical sync must retain current autostart'}
function Restore-VenueApi {throw 'Historical sync must not restore an old API'}
Return-Online
function Sync-VenueReturn([object]$Bundle){throw 'simulated historical sync failure'}
try{
 Return-Online
 throw 'Historical sync failure was ignored'
}catch{
 if($_.Exception.Message -ne 'simulated historical sync failure'){throw}
}
Write-Host 'USD HISTORY: successful and failed sync left current judging unchanged'
