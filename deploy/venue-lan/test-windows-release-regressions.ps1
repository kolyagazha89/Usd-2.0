# Native Windows PS5.1: exercise the actual release probe and Compose config.
$ErrorActionPreference='Stop'
$nativeDocker=(Get-Command docker -CommandType Application -ErrorAction Stop).Source
. (Join-Path $PSScriptRoot 'venue-control.ps1') -Action install
$sha='a'*40
$temp=Join-Path ([IO.Path]::GetTempPath()) ('usd-release-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp|Out-Null
$originalRoot=$Root;$originalEnv=$EnvFile
try{
 # A Docker stdin stub still executes the real JS through native node.exe.
 $shim=Join-Path $temp 'mock-image.cjs'
 [IO.File]::WriteAllText($shim,@'
const fs=require('node:fs');
const read=fs.readFileSync;
fs.existsSync=p=>String(p).startsWith('/app/');
fs.readFileSync=(p,...rest)=>String(p)==='/app/usd-release.json'?JSON.stringify({revision:'a'.repeat(40)}):String(p).startsWith('/app/')?'venue_private.active_stage':read(p,...rest);
'@)
 function docker {
  if($args[0] -eq 'image'){$global:LASTEXITCODE=0;return $sha}
  if($args -contains '-e'){throw 'Release JS must use stdin, not native -e argument quoting'}
  if($args -notcontains '-i' -or $args -notcontains '-') {throw 'Missing native stdin flags'}
  ($input -join [Environment]::NewLine)|& node --require $shim - $sha
  if($LASTEXITCODE -ne 0){throw 'Actual release-probe JS failed in native node'}
 }
 Assert-VenueReleaseImages $sha
 Remove-Item Function:\docker
 # A caller in A must not override B with A/.env. Compose config needs no daemon.
 $caller=Join-Path $temp 'A';$Root=Join-Path $temp 'B';$EnvFile=Join-Path $Root '.env'
 New-Item -ItemType Directory -Path $caller,$Root|Out-Null
 [IO.File]::WriteAllText((Join-Path $caller '.env'),'VENUE_STAGE_ID=wrong-stage')
 [IO.File]::WriteAllText($EnvFile,'VENUE_STAGE_ID=correct-stage')
 [IO.File]::WriteAllText((Join-Path $Root 'compose.yaml'),@'
services:
  api:
    image: test:local
    environment:
      VENUE_STAGE_ID: ${VENUE_STAGE_ID}
'@)
 function Get-VenueProject {return 'usd-venue-native-regression'}
 Push-Location $caller
 try{
  $composeArgs=Get-VenueComposeArguments
  $config=& $nativeDocker @composeArgs config --format json
  if($LASTEXITCODE -ne 0){throw 'Native Compose config failed'}
  $parsed=($config -join [Environment]::NewLine)|ConvertFrom-Json
  if($parsed.services.api.environment.VENUE_STAGE_ID -cne 'correct-stage'){throw 'Caller .env overrode selected workspace'}
 }finally{Pop-Location}
 # Reads must start an existing DB without reconciling bind mounts or images.
 function Invoke-Compose([string[]]$Arguments,[string]$Purpose){
  if(($Arguments -join ' ') -cne 'start --wait db'){throw 'Database read would recreate the running service'}
 }
 Start-VenueDatabase
 Write-Host 'USD NATIVE RELEASE PASS: stdin JS, selected env, no DB recreation'
}finally{
 $Root=$originalRoot;$EnvFile=$originalEnv
 Remove-Item -LiteralPath $temp -Recurse -Force
}

# Cancelling a child before its import commits restores the whole former
# stack, and does not unexpectedly start judging if the old stage was stopped.
$Root=$originalRoot;$EnvFile=$originalEnv
$stage='c510f672-79f7-44eb-8173-2a8ff94b1c0e'
$next='d510f672-79f7-44eb-8173-2a8ff94b1c0e'
$cancelTemp=Join-Path ([IO.Path]::GetTempPath()) ('usd-cancel-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $cancelTemp|Out-Null
try{
 $newFile=Join-Path $cancelTemp 'next.json'
 [IO.File]::WriteAllText($newFile,(@{snapshot=@{stageId=$next;expiresAt=[DateTime]::UtcNow.AddHours(2).ToString('o')}}|ConvertTo-Json))
 function Assert-VenueCompose {}
 function Ensure-DockerReady {}
 function Read-State {return [pscustomobject]@{phase='READY';stageId=$stage;fingerprint=('b'*64)}}
 function Read-Env {return @{'VENUE_STAGE_ID'=$stage;'VENUE_SIGNING_KEY_FINGERPRINT'=('b'*64)}}
 function Select-VenueFile {return $newFile}
 function Get-VenueHome {return $cancelTemp}
 function New-VenueStageWorkspace {return (Join-Path $cancelTemp 'new-workspace')}
 function Start-VenueDatabase {}
 function Test-IsActiveVenueStage {return $true}
 function Test-VenueJudgingRunning {return $script:previouslyRunning}
 function Export-VenueReturn {return @{stageId=$stage}}
 function docker {$null=$input;$global:LASTEXITCODE=0}
 function powershell.exe {$global:LASTEXITCODE=1}
 function Invoke-Compose([string[]]$Arguments,[string]$Purpose){
  $command=$Arguments -join ' '
  if($command -eq 'start --wait'){$script:fullRestore++}
  elseif($command -ne 'stop'){throw ('Unexpected cancellation command '+$command)}
 }
 foreach($running in @($true,$false)){
  $script:previouslyRunning=$running;$script:fullRestore=0
  try{Switch-ToNextStage;throw 'Child failure was hidden'}catch{
   if($_.Exception.Message -notmatch 'append next signed stage'){throw}
  }
  $expected=$(if($running){1}else{0})
  if($script:fullRestore -ne $expected){throw 'Cancelled switch did not preserve previous running state'}
 }
 Write-Host 'USD CANCEL PASS: all services restored only when previously running'
}finally{Remove-Item -LiteralPath $cancelTemp -Recurse -Force}

# /release reachability must not force registry downloads for prepared stages.
$script:cachedChecks=0
function Assert-VenueReleaseImages([string]$Sha){$script:cachedChecks++}
function Invoke-RestMethod {throw 'Prepared stage unexpectedly contacted public release'}
function Invoke-Docker {throw 'Prepared stage unexpectedly pulled registry images'}
if((Get-VenueReleaseSha @{'VENUE_IMAGE_TAG'=$sha}) -cne $sha -or $script:cachedChecks -ne 1){
 throw 'Verified image cache was not reused'
}
Write-Host 'USD CACHE PASS: cached prepared stage requires neither release nor registry'

# A valid-looking key belonging to another stage can be replaced before import.
$keyTemp=Join-Path ([IO.Path]::GetTempPath()) ('usd-key-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $keyTemp|Out-Null
$priorPrivate=$PrivateDir;$PrivateDir=$keyTemp
try{
 $wrong=Join-Path $keyTemp 'stored.key';$right=Join-Path $keyTemp 'replacement.key'
 [IO.File]::WriteAllText($wrong,('A'*43));[IO.File]::WriteAllText($right,('B'*43))
 $state=[pscustomobject]@{accessKey=$wrong};$script:keyChecks=0
 function Select-VenueFile {return $right}
 function Create-ExistingStaff([object]$State,[array]$Mounts,[switch]$CheckOnly){
  if(!$CheckOnly){throw 'Staff preflight attempted database writes'}
  $script:keyChecks++
  if([IO.File]::ReadAllText($State.accessKey) -cne ('B'*43)){throw 'wrong stage key'}
 }
 Confirm-VenueStaffKey $state @()
 if($script:keyChecks -ne 2){throw 'Replacement stage key was not revalidated'}
 Write-Host 'USD KEY RECOVERY PASS: wrong stage key replaced without DB writes'
}finally{$PrivateDir=$priorPrivate;Remove-Item -LiteralPath $keyTemp -Recurse -Force}
