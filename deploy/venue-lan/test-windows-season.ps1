# Windows PowerShell 5.1 executable test: a permanent Docker project for all
# competitions; exact per-stage ACK, crash-safe state and local config rotation.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'venue-control.ps1') -Action install
$stage='c510f672-79f7-44eb-8173-2a8ff94b1c0e'
$next='d510f672-79f7-44eb-8173-2a8ff94b1c0e'
$project='usd-venue'
if((Get-VenueProjectForStage $stage) -cne $project){throw 'Wrong single-Compose project'}
if((Get-VenueProjectForStage $next) -cne $project){throw 'New stage allocated a second Docker project'}
try{
 $null=Get-VenueProjectForStage 'untrusted'
 throw 'Invalid UUID was accepted'
}catch{if($_.Exception.Message -eq 'Invalid UUID was accepted'){throw}}
$script:MockState=[pscustomobject]@{stageId=$stage;project=$project}
function Read-State {return $script:MockState}
if((Get-VenueProject) -cne $project){throw 'Same Docker project not preserved'}
$script:MockState.stageId=$next
if((Get-VenueProject) -cne $project){throw 'Project changed after stage rotation'}
$script:MockState.project='usd-venue-attacker'
try{
 $null=Get-VenueProject
 throw 'Tampered Docker project accepted'
}catch{if($_.Exception.Message -eq 'Tampered Docker project accepted'){throw}}
$script:MockState.project=$project
$script:MockState.stageId=$stage
$temp=Join-Path ([IO.Path]::GetTempPath()) ('usd-venue-shared-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
$oldPrivate=$PrivateDir
$oldEnv=$EnvFile
$PrivateDir=$temp
$EnvFile=Join-Path $temp '.env'
[IO.File]::WriteAllText($EnvFile,"VENUE_STAGE_ID=$stage"+[Environment]::NewLine+
 "VENUE_SIGNING_KEY_FINGERPRINT="+('a'*64)+[Environment]::NewLine)
try{
 $script:JournalTip=('a'*64)
 $script:QuerySeen=''
 function docker {
  $global:LASTEXITCODE=0
  $script:QuerySeen=$args -join ' '
  return $script:JournalTip
 }
 $ackPath=Join-Path $temp ('sync-ack-'+$script:JournalTip+'.json')
 $receipt=@{accepted=$true;stageId=$stage;journalEndHash=$script:JournalTip}
 [IO.File]::WriteAllText($ackPath,($receipt|ConvertTo-Json -Compress))
 if(-not(Test-VerifiedVenueAck $stage)){throw 'Exact Ubuntu ACK rejected'}
 if($script:QuerySeen -notlike ("*WHERE stage_id='$stage'*")){
  throw 'ACK check did not select only the requested stage'
 }
 $script:JournalTip=('b'*64)
 if(Test-VerifiedVenueAck $stage){throw 'Changed journal falsely considered synchronized'}
 $script:JournalTip=('a'*64)
 if(Test-VerifiedVenueAck $next){throw 'ACK from another stage accepted'}
 Set-VenueSeasonEnv $next ('b'*64)
 $lines=[IO.File]::ReadAllText($EnvFile)
 if(-not $lines.Contains("VENUE_STAGE_ID=$next") -or
  -not $lines.Contains(('VENUE_SIGNING_KEY_FINGERPRINT='+('b'*64)))){
  throw 'Stage env was not updated within same operator folder'
 }
 if((Get-VenueProject) -cne $project){throw 'Stage rotation changed Docker project'}
 Write-Host 'USD SEASON: single project, stage-only ACK, protected env rotation passed'
}finally{
 $PrivateDir=$oldPrivate;$EnvFile=$oldEnv
 Remove-Item -LiteralPath $temp -Recurse -Force
}
