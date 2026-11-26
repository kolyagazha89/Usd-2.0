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
 $script:cachedImages=@{}
 function Get-OnlineVenueReleaseSha{return $script:target}
 function Test-VenueWebRevision([string]$Sha){return $true}
 function Test-VenueGatewayReady([string]$Ip){return $true}
 function Invoke-Docker {
  param([string[]]$Arguments,[string]$Purpose)
  $script:commands+=('docker '+($Arguments -join ' '))
  if($Arguments[0] -eq 'pull'){$script:cachedImages[$Arguments[1]]=$true}
 }
 function Read-VenueDockerLabels {
  param([string]$Kind,[string]$Identity)
  if($Kind -ne 'image' -or !$script:cachedImages.ContainsKey($Identity)){
   throw 'Attempted to inspect unknown image'
  }
  $label=[pscustomobject]@{}
  $label|Add-Member -NotePropertyName 'org.opencontainers.image.revision' -NotePropertyValue ($Identity.Split(':')[-1])
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

 # Startup downloads the verified release without recreating any containers.
 $PrivateDir=Join-Path $folder 'local-private'
 [void][IO.Directory]::CreateDirectory($PrivateDir)
 $state|Add-Member -NotePropertyName fingerprint -NotePropertyValue ('d'*64)
 [IO.File]::AppendAllText($EnvFile,'VENUE_SIGNING_KEY_FINGERPRINT='+$state.fingerprint+[Environment]::NewLine)
 $script:commands=@();$script:cachedImages=@{};$script:target=$next
 $before=[IO.File]::ReadAllText($EnvFile)
 $result=Cache-VenueStartupImages $state
 if($result -cne 'cached' -or [IO.File]::ReadAllText($EnvFile) -cne $before -or
   ($script:commands -join ';') -match 'compose|migrate|down|--volumes' -or
   $script:commands.Count -ne 2 -or (Get-VenueCachedWebTarget $state) -cne $next){
  throw 'Startup cache changed the installed runtime or failed to cache both immutable images'
 }
 $script:commands=@()
 if((Cache-VenueStartupImages $state) -cne 'cached' -or $script:commands.Count -ne 0){
  throw 'Startup downloaded already cached images'
 }
 $script:target=$null
 if((Cache-VenueStartupImages $state) -cne 'offline' -or (Get-VenueCachedWebTarget $state) -cne $next){
  throw 'No internet must preserve the previously verified startup candidate'
 }
 # Reproduce the cold-start race: no marker exists yet when the operator starts.
 Remove-Item -LiteralPath (Join-Path $PrivateDir 'startup-release.json') -Force
 $script:target=$next
 $script:running=$false
 function Test-VenueJudgingRunning{return $script:running}
 $script:commands=@()
 if((Get-VenueStartupTargetForStoppedStage $state) -cne $next -or $script:commands.Count -ne 0){
  throw 'Cold start must resolve the current release itself even without a prefetch marker'
 }
 $script:running=$true
 $script:target=$api
 if(Get-VenueStartupTargetForStoppedStage $state){throw 'An active judging API must not activate updates'}
 if((Get-VenueCachedWebTarget $state) -cne $next){throw 'Active judging start changed the verified candidate'}
 $script:running=$false
 $script:commands=@()
 Update-ReadyVenueFrontend $state -CachedTarget $next
 if((Read-Env)['VENUE_WEB_IMAGE_TAG'] -cne $next -or
   ($script:commands -join ';') -match 'docker pull|migrate|\bapi\b|\bdb\b' -or
   (Get-VenueCachedWebTarget $state)){
  throw 'Cached web update pulled again, touched API/data or replayed an applied marker'
 }
 # General API upgrades are allowed only with the exact same image schema,
 # no local journal, a verified backup and a healthy pinned replacement.
 $newApi='eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
 $script:target=$newApi
 $null=Cache-VenueStartupImages $state
 $beforeRuntime=[IO.File]::ReadAllText($EnvFile)
 $script:commands=@();$script:sameSchema=$false;$script:cleanJournal=$true;$script:failRuntime=$false
 function Get-VenueApiSchemaFingerprint([string]$Sha){
  if($script:sameSchema -or $Sha -ceq $api){return ('a'*64)}
  return ('b'*64)
 }
 function Test-VenueStageUnchanged([object]$State){return $script:cleanJournal}
 function Assert-VenueReleaseImages([string]$Sha){if($Sha -cne $newApi){throw 'Wrong cached API'}}
 function Save-VenueRegistrationUpgradeBackup {$script:commands+='backup'}
 function Wait-VenueLanReady([object]$State){$script:commands+='ready '+(Get-VenueRuntimeApiSha (Read-Env))}
 function Invoke-Compose {
  param([string[]]$Arguments,[string]$Purpose)
  $script:commands+=('compose '+($Arguments -join ' '))
  if($script:failRuntime -and $Purpose -eq 'activate cached compatible USD release'){throw 'Simulated candidate failure'}
 }
 if((Update-VenueCachedRuntime $state $newApi) -cne 'not-eligible' -or $script:commands.Count){
  throw 'A changed schema must not start an automatic backend rollout'
 }
 $script:sameSchema=$true;$script:cleanJournal=$false
 if((Update-VenueCachedRuntime $state $newApi) -cne 'not-eligible' -or $script:commands.Count){
  throw 'A stage with judging changes must not start an automatic backend rollout'
 }
 $script:cleanJournal=$true;$script:failRuntime=$true
 if((Update-VenueCachedRuntime $state $newApi) -cne 'rolled-back' -or
   [IO.File]::ReadAllText($EnvFile) -cne $beforeRuntime -or
   $script:commands[-1] -cne ('ready '+$api)){
  throw 'Failed automatic API rollout must restore exact configuration and verify old service'
 }
 $script:commands=@();$script:failRuntime=$false
 if((Update-VenueCachedRuntime $state $newApi) -cne 'updated'){
  throw 'Compatible cached API and web image did not activate'
 }
 $cfg=Read-Env
 if((Get-VenueRuntimeApiSha $cfg) -cne $newApi -or $cfg['VENUE_WEB_IMAGE_TAG'] -cne $newApi -or
   $cfg['VENUE_IMAGE_TAG'] -cne $api -or $cfg['VENUE_STAGE_ID'] -cne $stage -or
   $cfg['VENUE_JWT_SECRET'] -cne 'do-not-change-existing-auth-token' -or
   ($script:commands -join ';') -notmatch 'stop api;backup;compose up .*api frontend gateway;ready ' -or
   ($script:commands -join ';') -match 'migrate|down|--volumes'){
  throw 'Compatible auto-upgrade touched data, lost pins or skipped the backup'
 }
 $legacy='53833411c3ce82424b8c1ac40b029f201eeed863'
 $fixed='ff93d4957c4ca9f322a2832a511570e10ae65dcb'
 $state.image=$legacy
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
