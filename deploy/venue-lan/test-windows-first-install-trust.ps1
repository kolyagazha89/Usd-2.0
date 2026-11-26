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
 # A GUI worker must not silently choose the VPN or open an invisible dialog.
 $script:lanChoices=@()
 function Get-NetIPAddress {
  return @(
   [pscustomobject]@{AddressState='Preferred';InterfaceAlias='Wi-Fi';IPAddress='192.168.25.10'},
   [pscustomobject]@{AddressState='Preferred';InterfaceAlias='Ethernet';IPAddress='10.25.0.5'},
   [pscustomobject]@{AddressState='Preferred';InterfaceAlias='vEthernet (WSL)';IPAddress='172.18.0.2'}
  )
 }
 function Select-VenueOption([string]$Title,[string]$Text,[object[]]$Options){
  $script:lanChoices=@($Options)
  if($script:VenueStep -cne 'select-lan-network'){throw 'LAN selection must announce the actual waiting step'}
  return [string]$Options[0].Value
 }
 if((Get-PrivateLanIp) -cne '192.168.25.10' -or $script:lanChoices.Count -ne 2){
  throw 'Network selection must offer only valid LAN adapters'
 }
 # Operator first install must fail visibly if a signed bundle was not supplied.
 $Operator=$true
 $script:StageFile=''
 $blocked=$false
 try{New-InitialState|Out-Null}catch{$blocked=$_.Exception.Message -match 'пакет'}
 if(!$blocked -or (Test-Path -LiteralPath $EnvFile)){throw 'Operator must reject a missing signed bundle before choosing files'}
 $Operator=$false
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
 # Recreate the durable boundary after CONFIGURED was written, before the
 # staged .env is promoted. Verify no input dialog or new credentials are needed.
 $pending=Join-Path $PrivateDir $first.pendingConfig
 $envHash=(Get-FileHash -LiteralPath $EnvFile).Hash
 [IO.File]::Move($EnvFile,$pending)
 $originalEnv=[IO.File]::ReadAllText($pending)
 [IO.File]::AppendAllText($pending,'# corrupted')
 $blocked=$false
 try{Complete-VenueInitialConfig (Read-State)}catch{$blocked=$true}
 if(!$blocked -or (Test-Path -LiteralPath $EnvFile)){throw 'Corrupted pending config was promoted'}
 [IO.File]::WriteAllText($pending,$originalEnv,(New-Object System.Text.UTF8Encoding($false)))
 Complete-VenueInitialConfig (Read-State)
 if((Get-FileHash -LiteralPath $EnvFile).Hash -cne $envHash -or (Test-Path -LiteralPath $pending)){
  throw 'Recovery must complete with the exact original credentials'
 }
 # Without state, unknown .env still blocks install and is never modified.
 Remove-Item -LiteralPath $StateFile -Force
 $blocked=$false
 try{New-InitialState|Out-Null}catch{$blocked=$true}
 if(!$blocked -or (Get-FileHash -LiteralPath $EnvFile).Hash -cne $envHash){
  throw 'An unrelated .env must be preserved'
 }
 # Simulate interruption after writing immutable input files, before DB creation.
 Remove-Item -LiteralPath $EnvFile -Force
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
 # A different signed access secret must never replace the immutable first-setup key.
 Remove-Item -LiteralPath $StateFile,$EnvFile -Force
 [IO.File]::WriteAllText($script:staffPath,('d'*43))
 $script:Selected=0
 $rejected=$false
 try{New-InitialState|Out-Null}catch{$rejected=$true}
 if(!$rejected -or (Test-Path -LiteralPath $EnvFile)){
  throw 'Changing the initial staff key was accepted after an interrupted setup'
 }
 $originalAccess=[IO.File]::ReadAllText((Join-Path $PrivateDir 'venue-staff-access.key'))
 if($originalAccess -cne ('c'*43)){
  throw 'Signed initial staff access key was overwritten by a retry'
 }
 # Resume a persisted installation with an expired package. The durable
 # state must change only after both the fresh signature and staff key pass.
 Write-PrivateFile $EnvFile $originalEnv
 $envHash=(Get-FileHash -LiteralPath $EnvFile).Hash
 Set-SetupPhase $replayed 'CONFIGURED'
 $script:FreshStaffAccepted=$false
 $script:InstallReceiptExists=$false
 $script:RecoveredByReceipt=$false
 function Invoke-VenueStageCheck([array]$Mounts,[string]$Mode){
  if($Mode -eq '--check-uninstalled' -and !$script:InstallReceiptExists){return}
  if($Mode -eq '--check-installed' -and $script:InstallReceiptExists){return}
  if($Mode -eq '--dry-run' -and ($Mounts -join ' ') -match 'signed-stage-[a-f0-9]{32}\.json'){return}
  $failure=[InvalidOperationException]::new('expected test refusal')
  $failure.Data['VenueExitCode']=$(if($Mode -eq '--check-uninstalled'){23}else{20})
  throw $failure
 }
 function Create-ExistingStaff([object]$State,[array]$Mounts,[switch]$CheckOnly,[switch]$Preflight){
  if($CheckOnly){$script:RecoveredByReceipt=$true;return}
  if(!$Preflight -or !$script:FreshStaffAccepted){throw 'expected staff preflight refusal'}
 }
 function Select-VenueFile([string]$Title,[string]$Filter){
  if($Filter -like '*json*'){return $script:stagePath}
  return $script:staffPath
 }
 $oldPackage=$replayed.package
 $oldAccess=$replayed.accessKey
 $failed=$false
 try{Confirm-SignedStage $replayed|Out-Null}catch{$failed=$true}
 if(!$failed -or (Read-State).package -cne $oldPackage -or $replayed.accessKey -cne $oldAccess){
  throw 'Failed staff preflight changed persisted package or key'
 }
 $script:FreshStaffAccepted=$true
 Confirm-SignedStage $replayed|Out-Null
 if($replayed.package -ceq $oldPackage -or (Read-State).package -cne $replayed.package -or
    (Read-State).accessKey -cne $replayed.accessKey -or $replayed.phase -ne 'CONFIGURED' -or
    [IO.File]::ReadAllText($replayed.accessKey) -cne ('d'*43) -or
    (Get-FileHash -LiteralPath $EnvFile).Hash -cne $envHash -or
    !(Test-Path -LiteralPath $oldPackage) -or !(Test-Path -LiteralPath $oldAccess)){
  throw 'Verified replacement did not retain the setup phase, DB credentials and prior files'
 }
 $replayed.package=$oldPackage
 $replayed.accessKey=$oldAccess
 Set-SetupPhase $replayed 'STORAGE_READY'
 Set-SetupPhase $replayed 'SCHEMA_READY'
 $script:InstallReceiptExists=$true
 Confirm-SignedStage $replayed|Out-Null
 if(!$script:RecoveredByReceipt -or (Read-State).phase -ne 'IMPORTED' -or (Read-State).package -cne $oldPackage){
  throw 'A committed package interrupted before IMPORTED must be resumed by exact receipt'
 }
 Write-Host 'USD WINDOWS INITIAL TRUST PASS: local PEM pinned, partial bootstrap replayed, download disposable'
} finally {
 $Root=$oldRoot
 if(Test-Path -LiteralPath $testRoot){Remove-Item -LiteralPath $testRoot -Recurse -Force}
}
