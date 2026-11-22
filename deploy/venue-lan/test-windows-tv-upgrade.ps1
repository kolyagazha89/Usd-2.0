#requires -Version 5.1
# No Docker, internet, administrator permissions or real venue data.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'venue-control.ps1') -Action install
$oldRoot=$Root;$oldEnvFile=$EnvFile
$folder=Join-Path ([IO.Path]::GetTempPath()) ('usd-tv-upgrade-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($folder)|Out-Null
try{
 $Root=$folder;$EnvFile=Join-Path $folder '.env'
 $api='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
 $tv='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
 $next='cccccccccccccccccccccccccccccccccccccccc'
 $stage='324c3410-8ab9-4dcd-9965-31b5a4f59ecd'
 $original=@(
  "VENUE_IMAGE_TAG=$api",
  "VENUE_STAGE_ID=$stage",
  'VENUE_BIND_IP=192.168.20.12',
  'VENUE_JWT_SECRET=do-not-change-existing-auth-token'
 ) -join [Environment]::NewLine
 [IO.File]::WriteAllText($EnvFile,$original+[Environment]::NewLine)
 $state=[pscustomobject]@{phase='READY';stageId=$stage;image=$api;ip='192.168.20.12'}
 $roundtrip=Read-Env -Path $EnvFile
 if($roundtrip['VENUE_IMAGE_TAG'] -cne $state.image -or
    $roundtrip['VENUE_STAGE_ID'] -cne $state.stageId -or
    $roundtrip['VENUE_BIND_IP'] -cne $state.ip){
  throw ('READY TV fixture mismatch (API='+
    ($roundtrip['VENUE_IMAGE_TAG'] -ceq $state.image)+', stage='+
    ($roundtrip['VENUE_STAGE_ID'] -ceq $state.stageId)+', IP='+
    ($roundtrip['VENUE_BIND_IP'] -ceq $state.ip)+')')
 }

 $script:target=$tv;$script:commands=@();$script:failOnce=$false
 function Get-OnlineVenueReleaseSha{return $script:target}
 function Test-VenueWebRevision([string]$Sha){return $true}
 function Test-VenueGatewayReady([string]$Ip){return $true}
 function Invoke-Docker {
  param([string[]]$Arguments,[string]$Purpose)
  $script:commands+=('docker '+($Arguments -join ' '))
 }
 function Read-VenueDockerLabels {
  param([string]$Kind,[string]$Identity)
  if($Kind -ne 'image' -or $Identity -ne ('ghcr.io/kolyagazha89/usd-2.0-frontend:'+$script:target)){
   throw 'Attempted to inspect unknown image'
  }
  $label=[pscustomobject]@{}
  $label|Add-Member -NotePropertyName 'org.opencontainers.image.revision' -NotePropertyValue $script:target
  return $label
 }
 function Invoke-Compose {
  param([string[]]$Arguments,[string]$Purpose)
  $script:commands+=('compose '+($Arguments -join ' '))
  if($script:failOnce){$script:failOnce=$false;throw 'Simulated frontend gateway restart failure'}
 }
 Update-ReadyVenueFrontend $state
 $cfg=Read-Env
 if($cfg['VENUE_WEB_IMAGE_TAG'] -ne $tv -or $cfg['VENUE_IMAGE_TAG'] -ne $api -or
  $cfg['VENUE_STAGE_ID'] -ne $stage -or $cfg['VENUE_JWT_SECRET'] -ne 'do-not-change-existing-auth-token'){
  throw 'LIVE upgrade modified the pinned stage, API, JWT or did not write frontend version'
 }
 $commands=$script:commands -join ';'
 if($commands -notmatch ('frontend:'+$tv) -or $commands -notmatch '--no-deps' -or
  $commands -notmatch 'frontend gateway' -or $commands -match 'down|--volumes|migrate|\bdb\b|\bapi\b'){
  throw ('LIVE upgrade touched more than TV/gateway: '+$commands)
 }
 # An offline reinstall must retain the last verified TV and never pull.
 $script:commands=@();$script:target=$null
 Update-ReadyVenueFrontend $state
 if((Read-Env)['VENUE_WEB_IMAGE_TAG'] -ne $tv -or
  $script:commands.Count -ne 0){
  throw 'Offline READY retry unexpectedly re-created frontend/gateway or changed pinned TV'
 }
 # Same verified published SHA must be a no-op too (judge access stays online).
 $script:commands=@();$script:target=$tv
 Update-ReadyVenueFrontend $state
 if($script:commands.Count -ne 0){
  throw 'READY retry with the already installed version restarted live frontend'
 }
 # Failed rollout rolls back the exact prior .env without touching data.
 $script:commands=@();$script:target=$next;$script:failOnce=$true
 $rejected=$false
 try{Update-ReadyVenueFrontend $state}catch{$rejected=($ERROR[0].Exception.Message -match 'LIVE')}
 if(!$rejected -or (Read-Env)['VENUE_WEB_IMAGE_TAG'] -ne $tv){
  throw 'Failed TV upgrade did not preserve the previous known working image'
 }
 $inherited=[ordered]@{VENUE_IMAGE_TAG=$api;VENUE_STAGE_ID=$stage}
 Copy-VenueWebVersion $inherited @{'VENUE_WEB_IMAGE_TAG'=$tv}
 if($inherited['VENUE_WEB_IMAGE_TAG'] -cne $tv -or $inherited['VENUE_IMAGE_TAG'] -cne $api){throw 'Next stage lost the upgraded web version or changed API'}
 $rejected=$false
 try{Copy-VenueWebVersion $inherited @{'VENUE_WEB_IMAGE_TAG'='latest'}}catch{$rejected=$true}
 if(!$rejected -or $inherited['VENUE_WEB_IMAGE_TAG'] -cne $tv){throw 'Unpinned inherited web version was accepted'}
 Write-Host 'USD FRONTEND UPGRADE PASS: READY phase updates only spectator frontend/gateway, rollback and next stage preserve versions and secrets'

 $legacy='53833411c3ce82424b8c1ac40b029f201eeed863'
 $fixed='ff93d4957c4ca9f322a2832a511570e10ae65dcb'
 $state.image=$legacy
 $state|Add-Member -NotePropertyName fingerprint -NotePropertyValue ('d'*64)
 $legacyEnv=$original.Replace($api,$legacy)+[Environment]::NewLine+
  'VENUE_SIGNING_KEY_FINGERPRINT='+$state.fingerprint+[Environment]::NewLine
 [IO.File]::WriteAllText($EnvFile,$legacyEnv)
 $script:commands=@();$script:failActivation=$false;$script:failBackup=$false
 function Test-VenueRuntimeImagesCached([string]$Sha){return $false}
 function Assert-VenueReleaseImages([string]$Sha){if($Sha -cne $fixed){throw 'Unexpected API release'}}
 function Assert-NoOtherVenueGatewayRunning {}
 function Assert-VenueDatabaseVolume {}
 function Assert-VenueVolumeRetained([string[]]$Names){}
 function Start-VenueDatabase {}
 function Test-IsActiveVenueStage([string]$Id){return $Id -ceq $stage}
 function Assert-VenueDatabaseImportRole {}
 function Save-VenueRegistrationUpgradeBackup {
  $script:commands+='backup'
  if($script:failBackup){throw 'Simulated backup failure'}
 }
 function Wait-VenueLanReady([object]$State){
  $script:commands+=('ready '+(Get-VenueRuntimeApiSha (Read-Env)))
 }
 function Invoke-Compose {
  param([string[]]$Arguments,[string]$Purpose)
  $script:commands+=($Arguments -join ' ')
  if($Arguments -contains 'migrate' -and $env:VENUE_API_IMAGE_TAG -cne $fixed){throw 'Migrated with the wrong API image'}
  if($script:failActivation -and $Purpose -eq 'start fixed local registration'){throw 'Simulated API activation failure'}
 }
 $script:failBackup=$true
 $rejected=$false
 try{Update-LegacyVenueRegistration $state}catch{$rejected=$_.Exception.Message -match 'Simulated backup failure'}
 if(!$rejected -or ($script:commands -join ';') -match 'migrate' -or [IO.File]::ReadAllText($EnvFile) -cne $legacyEnv){
  throw 'A failed backup changed the installed environment or started a migration'
 }
 $script:commands=@();$script:failBackup=$false;$script:failActivation=$true
 $rejected=$false
 try{Update-LegacyVenueRegistration $state}catch{$rejected=$_.Exception.Message -match 'Simulated API activation failure'}
 if(!$rejected -or [IO.File]::ReadAllText($EnvFile) -cne $legacyEnv -or $script:commands[-1] -cne ('ready '+$legacy)){
  throw 'A failed registration upgrade did not restore the old runtime and exact configuration'
 }
 $script:commands=@();$script:failActivation=$false
 if(-not(Update-LegacyVenueRegistration $state)){throw 'Affected build was left installed'}
 $cfg=Read-Env
 $commands=$script:commands -join ';'
 if((Get-VenueRuntimeApiSha $cfg) -cne $fixed -or $cfg['VENUE_WEB_IMAGE_TAG'] -cne $fixed -or
    $cfg['VENUE_IMAGE_TAG'] -cne $legacy -or $cfg['VENUE_JWT_SECRET'] -cne 'do-not-change-existing-auth-token' -or
    $commands -notmatch 'stop api;backup;run .*migrate deploy.*;up .*api frontend gateway;ready ' -or
    $commands -match 'down|--volumes|--apply'){
  throw ('Registration upgrade did not preserve the installed stage and replace its running API: '+$commands)
 }
 $script:commands=@()
 if((Update-LegacyVenueRegistration $state) -or $script:commands.Count -ne 0){
  throw 'Completed registration upgrade ran twice'
 }
 Write-Host 'USD REGISTRATION UPGRADE PASS: download, backup gate, migrations, fixed API/frontend, exact rollback and safe retry'
}finally{
 $Root=$oldRoot;$EnvFile=$oldEnvFile
 if(Test-Path -LiteralPath $folder){[IO.Directory]::Delete($folder,$true)}
}
