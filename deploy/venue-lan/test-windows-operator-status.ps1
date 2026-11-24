#requires -Version 5.1
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'venue-control.ps1') -Action status

$stage='c510f672-79f7-44eb-8173-2a8ff94b1c0e'
$other='d510f672-79f7-44eb-8173-2a8ff94b1c0e'
$PrivateDir=Join-Path ([IO.Path]::GetTempPath()) ('usd-status-test-'+[guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($PrivateDir)
try{
 $package=Join-Path $PrivateDir 'stage.json'
 [IO.File]::WriteAllText($package,(@{snapshot=@{syncAuthorization=@{expiresAt=[DateTime]::UtcNow.AddDays(7).ToString('o')}}}|ConvertTo-Json -Depth 4))
 $script:state=$null
 $script:dockerReady=$true
 $script:dbExists=$true
 $script:dbRunning=$true
 $script:apiRunning=$true
 $script:activeId=$stage
 $script:journal='0'*64
 $script:servedStage=$stage
 function Read-State {return $script:state}
 function Read-Env {return @{VENUE_STAGE_ID=$stage;VENUE_BIND_IP='192.168.20.10';VENUE_IMAGE_TAG=('a'*40)}}
 function Test-DockerReady {return $script:dockerReady}
 function Assert-VenueDatabaseVolume {if(!$script:dbExists){throw 'Том базы отсутствует.'}}
 function Assert-VenueVolumeRetained {}
 function Get-VenueComposeArguments {return @('compose')}
 function Test-VenueApiReady {return $true}
 function Test-VenueGatewayReady {return $true}
 function docker {
  $global:LASTEXITCODE=0
  $command=$args -join ' '
  if($command -match 'running -q db' -and $script:dbRunning){'abcdef123456'}
  if($command -match 'running -q api' -and $script:apiRunning){'fedcba654321'}
  if($command -match 'psql'){
   if(($input -join '') -notmatch 'venue_private\.operation_journal'){throw 'Status missed the journal'}
   @{active=$script:activeId;stages=@($stage,$other);registrations=11;participants=32;hash=$script:journal}|ConvertTo-Json -Compress
  }
 }
 function curl.exe {
  $global:LASTEXITCODE=0
  if($args -notcontains '--cacert' -or $args -contains '--insecure'){throw 'Untrusted HTTPS probe'}
  if($args[-1] -like '*/results/venue-live'){return (@{stage=@{id=$script:servedStage}}|ConvertTo-Json -Compress)}
  return '<!DOCTYPE html><html>'
 }
 function Assert-Mode([string]$Expected){
  $status=Get-VenueOperatorStatus
  if($status.mode -cne $Expected){throw ("Expected '$Expected', got '"+$status.mode+"': "+$status.reason)}
 }
 Assert-Mode 'empty'
 $script:state=[pscustomobject]@{stageId=$stage;phase='CONFIGURED';ip='192.168.20.10';package=$package}
 Assert-Mode 'preparing'
 $script:state.phase='READY'
 $script:dockerReady=$false
 Assert-Mode 'attention'
 $script:dockerReady=$true
 $script:dbExists=$false
 Assert-Mode 'attention'
 $script:dbExists=$true
 $script:apiRunning=$false
 $script:dbRunning=$false
 Assert-Mode 'ready'
 $script:apiRunning=$true
 $script:dbRunning=$true
 $ca=Join-Path $PrivateDir 'USD-Venue-CA.crt'
 [IO.File]::WriteAllText($ca,'test-only CA marker')
 Assert-Mode 'working'
 $status=Get-VenueOperatorStatus
 if($status.registrations -ne 11 -or $status.participants -ne 32){throw 'DB counts were not surfaced'}
 $script:servedStage=$other
 Assert-Mode 'attention'
 $script:servedStage=$stage
 $script:journal='b'*64
 Assert-Mode 'pending'
 $script:apiRunning=$false
 $ack=Join-Path $PrivateDir ('sync-ack-'+$script:journal+'.json')
 [IO.File]::WriteAllText($ack,(@{accepted=$true;stageId=$stage;journalEndHash=$script:journal;at=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json))
 Assert-Mode 'synced'
 $script:journal='c'*64
 Assert-Mode 'pending'
 $script:activeId=$other
 Assert-Mode 'archived'
 Write-Host 'USD STATUS PASS: Docker, DB and pinned-stage HTTPS gates, counts, current journal ACK, and archived stage'
}finally{Remove-Item -LiteralPath $PrivateDir -Recurse -Force}
