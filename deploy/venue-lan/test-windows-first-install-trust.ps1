#requires -Version 5.1
# Exercises the real first-install persistence of immutable trust material.
# Windows runner temp files only: no Docker, secrets, network or elevation.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'venue-control.ps1') -Action install
$oldRoot=$Root
$testRoot=Join-Path ([IO.Path]::GetTempPath()) ('usd-venue-bootstrap-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot -Force|Out-Null
try {
 $Root=$testRoot
 $PrivateDir=Join-Path $Root 'local-private'
 New-Item -ItemType Directory -Path $PrivateDir -Force|Out-Null
 $StateFile=Join-Path $PrivateDir 'setup-state.json'
 $EnvFile=Join-Path $Root '.env'
 $script:Selected=0
 $script:stageId='c510f672-79f7-44eb-8173-2a8ff94b1c0e'
 $script:publicPath=Join-Path $testRoot 'downloaded-signing-public.pem'
 $script:staffPath=Join-Path $testRoot 'downloaded-staff.key'
 $script:stagePath=Join-Path $testRoot 'downloaded-stage.json'
 $originalPem="-----BEGIN PUBLIC KEY-----`nTEST PUBLIC KEY`n-----END PUBLIC KEY-----`n"
 [IO.File]::WriteAllText($script:publicPath,$originalPem)
 [IO.File]::WriteAllText($script:staffPath,('c'*43))
 $signed=@{
  integrity=@{publicKeyFingerprint=('b'*64)}
  snapshot=@{
   stageId=$script:stageId
   syncAuthorization=@{token=('a'*43)}
   staffAccess=@{algorithm='AES-256-GCM'}
  }
 }
 [IO.File]::WriteAllText($script:stagePath,($signed|ConvertTo-Json -Depth 8))
 function Get-VenueReleaseSha([object]$Config){return 'a'*40}
 function Get-PrivateLanIp {return '192.168.25.10'}
 function Get-VenueHome {return $Root}
 function Assert-NoOrphanedVenueStack([string]$Project){}
 function Read-VenueFingerprint {return 'b'*64}
 function Select-VenueFile([string]$Title,[string]$Filter){
  $script:Selected++
  switch($script:Selected){
   1 {return $script:stagePath}
   2 {return $script:publicPath}
   3 {return $script:staffPath}
   default {throw 'Unexpected extra file selector during initial install'}
  }
 }
 $first=New-InitialState
 $privatePublic=Join-Path $PrivateDir 'venue-signing-public.pem'
 if($first.publicKey -cne $privatePublic -or !(Test-Path -LiteralPath $privatePublic)){
  throw 'The installer did not pin the downloaded trusted PEM inside its private workspace'
 }
 if([IO.File]::ReadAllText($privatePublic) -cne $originalPem){
  throw 'Local public key differs from the operator-selected PEM'
 }
 # Simulate interruption after writing immutable input files, before DB creation.
 Remove-Item -LiteralPath $StateFile,$EnvFile -Force
 $script:Selected=0
 $replayed=New-InitialState
 if($replayed.publicKey -cne $privatePublic){
  throw 'Retry after interrupted first setup did not reuse the pinned key'
 }
 # Downloaded file is not a runtime dependency.
 Remove-Item -LiteralPath $script:publicPath -Force
 if(!(Test-Path -LiteralPath $replayed.publicKey)){
  throw 'Deleting original download broke trusted-key availability'
 }
 if([IO.File]::ReadAllText($replayed.publicKey) -cne $originalPem){
  throw 'Repeat installation did not preserve the original trust material'
 }
 Write-Host 'USD WINDOWS INITIAL TRUST PASS: local PEM pinned, partial bootstrap replayed, download disposable'
} finally {
 $Root=$oldRoot
 if(Test-Path -LiteralPath $testRoot){Remove-Item -LiteralPath $testRoot -Recurse -Force}
}
