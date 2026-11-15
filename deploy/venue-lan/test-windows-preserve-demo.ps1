#requires -Version 5.1
# Reproduce an interrupted old DEMO -> real installation on native Windows.
# Never connect to Docker, and never modify a real user's data.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'venue-control.ps1') -Action install

$temp=Join-Path ([IO.Path]::GetTempPath()) ('usd-keep-demo-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($temp)|Out-Null
$oldRoot=$Root;$oldPrivate=$PrivateDir;$oldStateFile=$StateFile
$oldEnv=$EnvFile;$oldStageFile=$StageFile
try {
 $Root=$temp;$PrivateDir=Join-Path $Root 'local-private'
 [IO.Directory]::CreateDirectory($PrivateDir)|Out-Null
 $StateFile=Join-Path $PrivateDir 'setup-state.json'
 $EnvFile=Join-Path $Root '.env'
 $id='c510f672-79f7-44eb-8173-2a8ff94b1c0e'
 $next='d510f672-79f7-44eb-8173-2a8ff94b1c0e'
 $old=[ordered]@{
  phase='READY';format=1;demo=$true;stageId=$id
  image=('a'*40);fingerprint=('b'*64);ip='192.168.25.10'
 }
 [IO.File]::WriteAllText($StateFile,($old|ConvertTo-Json -Compress))
 [IO.File]::WriteAllLines($EnvFile,[string[]]@(
  ('VENUE_STAGE_ID='+$id),('VENUE_IMAGE_TAG='+('a'*40)),
  ('VENUE_SIGNING_KEY_FINGERPRINT='+('b'*64)),
  'VENUE_BIND_IP=192.168.25.10'
 ))
 $json=Join-Path $temp 'signed-real.json'
 [IO.File]::WriteAllText($json,(@{snapshot=@{stageId=$next}}|ConvertTo-Json -Depth 4))
 $StageFile=$json
 foreach($file in @('USD-Install.cmd','venue-control.ps1')){
  [IO.File]::WriteAllText((Join-Path $Root $file),'signed program fixture')
 }
 $originalEnv=[IO.File]::ReadAllText($EnvFile)
 $originalState=[IO.File]::ReadAllText($StateFile)
 function Get-VenueKitFiles {return @('USD-Install.cmd','venue-control.ps1')}
 function Assert-VenueCompose {}
 function Ensure-DockerReady {}
 $script:events=New-Object System.Collections.ArrayList
 $script:childFail=$false;$script:childCalls=0
 function docker {
  if(@($args) -contains 'ps'){
   $global:LASTEXITCODE=0
   return 'abcabcabcabc'
  }
  throw 'Unexpected Docker write from old DEMO recovery'
 }
 function Invoke-Compose([string[]]$Arguments,[string]$Purpose){
  $cmd=$Arguments -join ' '
  if($cmd -notin @('stop','start')){throw ('Unsafe Docker action: '+$cmd)}
  [void]$script:events.Add($cmd)
 }
 function powershell.exe {
  $argv=@($args)
  if($argv -notcontains '-StageFile' -or $argv -notcontains $StageFile -or
     $argv -notcontains '-Action' -or $argv -notcontains 'install'){
   throw 'Child real stage was not launched with selected signed package'
  }
  $script:childCalls++
  $global:LASTEXITCODE=$(if($script:childFail){17}else{0})
 }
 Install-Local
 $target=Join-Path (Join-Path $Root 'real-stages') $next
 foreach($name in @('USD-Install.cmd','venue-control.ps1')){
  if(!(Test-Path -LiteralPath (Join-Path $target $name))){
   throw ('New isolated real stage missing '+$name)
  }
 }
 if((Test-Path -LiteralPath (Join-Path $target '.env')) -or
    (Test-Path -LiteralPath (Join-Path $target 'shared-source.json')) -or
    (Test-Path -LiteralPath (Join-Path $target 'local-private'))){
  throw 'Old credentials or shared Docker project leaked into real stage'
 }
 if([IO.File]::ReadAllText($StateFile) -cne $originalState -or
    [IO.File]::ReadAllText($EnvFile) -cne $originalEnv){
  throw 'Old DEMO data changed after successful independent install'
 }
 if($script:childCalls -ne 1 -or ($script:events -join ',') -cne 'stop'){
  throw 'Old DEMO was not stopped safely on a successful new installation'
 }
 $script:childFail=$true
 try{Install-Local;throw 'Child installation error was swallowed'}catch{
  if($_.Exception.Message -eq 'Child installation error was swallowed'){throw}
 }
 if(($script:events -join ',') -cne 'stop,stop,start'){
  throw 'Failed child did not restore the formerly running DEMO'
 }
 if([IO.File]::ReadAllText($StateFile) -cne $originalState -or
    [IO.File]::ReadAllText($EnvFile) -cne $originalEnv){
  throw 'Old DEMO changed after failed installation'
 }
 Write-Host 'USD WINDOWS PRESERVATION PASS: old demo retained, isolated real stage, rollback after child failure'
}finally{
 $Root=$oldRoot;$PrivateDir=$oldPrivate;$StateFile=$oldStateFile
 $EnvFile=$oldEnv;$StageFile=$oldStageFile
 [IO.Directory]::Delete($temp,$true)
}
