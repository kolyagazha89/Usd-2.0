#requires -Version 5.1
# Simulates a TV-only update on PowerShell 5.1; no real Docker, database or user files.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'venue-control.ps1') -Action update-live
$temp=Join-Path ([IO.Path]::GetTempPath()) ('usd-tv-update-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($temp)|Out-Null
$oldRoot=$Root;$oldPrivate=$PrivateDir;$oldEnv=$EnvFile
$target='6a9856170c2cc26b011225b2f76c89366d6bb7c2'
$oldSha='a'*40
try{
 $Root=$temp;$PrivateDir=Join-Path $temp 'local-private';$EnvFile=Join-Path $temp '.env'
 $stage='c510f672-79f7-44eb-8173-2a8ff94b1c0e'
 $fingerprint='b'*64
 [IO.File]::WriteAllText($EnvFile,(@(
  ('VENUE_STAGE_ID='+$stage),
  ('VENUE_IMAGE_TAG='+$oldSha),
  ('VENUE_SIGNING_KEY_FINGERPRINT='+$fingerprint)
 ) -join [Environment]::NewLine)+[Environment]::NewLine)
 $original=[IO.File]::ReadAllText($EnvFile)
 $script:mode='pass';$script:composeCalls=New-Object 'System.Collections.Generic.List[string]'
 function Read-State {
  return [pscustomobject]@{phase='READY';stageId=$stage;image=$oldSha;fingerprint=$fingerprint;ip='192.168.50.10'}
 }
 function Ensure-DockerReady {}
 function Test-IsActiveVenueStage([string]$StageId) {return ($StageId -ceq $stage)}
 function Get-VenueComposeArguments {return @('compose')}
 function Read-VenueDockerLabels([string]$Kind,[string]$Identity){
  if($Kind -cne 'image' -or $Identity -cnotmatch $target){throw 'Incorrect image label probe'}
  return [pscustomobject]@{'org.opencontainers.image.revision'=$target}
 }
 function Invoke-Docker {throw 'No image download expected with pre-cached frontend'}
 function docker {
  $a=@($args)
  $global:LASTEXITCODE=0
  if($a[0] -eq 'image' -and $a[1] -eq 'inspect'){return 'sha256:aaaabbbbcccc'}
  if($a[0] -eq 'inspect' -and $a[1] -eq '--format'){return 'sha256:aaaabbbbcccc'}
  if($a -contains 'ps'){return '123456789abc'}
  throw ('Unexpected Docker operation: '+($a -join ' '))
 }
 function Invoke-Compose([string[]]$Arguments,[string]$Purpose){
  if(($Arguments -join ' ') -cne 'up -d --no-deps --no-build --pull never frontend'){
   throw ('Dangerous Compose action: '+($Arguments -join ' '))
  }
  $script:composeCalls.Add($Purpose)
  if($script:mode -eq 'fail-first'){
   $script:mode='restore'
   throw 'Simulated frontend creation failure'
  }
 }
 Update-VenueTV
 if($script:composeCalls.Count -ne 1){throw 'TV update did not recreate exactly one frontend'}
 $cfg=Read-Env
 if($cfg['VENUE_IMAGE_TAG'] -cne $oldSha -or $cfg['VENUE_FRONTEND_IMAGE_TAG'] -cne $target){
  throw 'Frontend release changed old API/database identity'
 }
 Update-VenueTV
 if($script:composeCalls.Count -ne 1){throw 'Idempotent rerun touched frontend'}
 [IO.File]::WriteAllText($EnvFile,$original)
 $script:mode='fail-first'
 $failed=$false
 try{Update-VenueTV}catch{
  if($_.Exception.Message -notmatch 'Simulated frontend creation failure'){throw}
  $failed=$true
 }
 if(!$failed -or $script:composeCalls.Count -ne 3){throw 'Frontend rollback not attempted exactly once'}
 if([IO.File]::ReadAllText($EnvFile) -cne $original){throw 'Rollback corrupted original .env'}
 Write-Host 'USD WINDOWS TV PASS: safe frontend only, idempotent, old API unchanged, rollback restores prior image'
}finally{
 $Root=$oldRoot;$PrivateDir=$oldPrivate;$EnvFile=$oldEnv
 [IO.Directory]::Delete($temp,$true)
}
