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
  'VENUE_IMAGE_TAG='+$api,
  'VENUE_STAGE_ID='+$stage,
  'VENUE_BIND_IP=192.168.20.12',
  'VENUE_JWT_SECRET=do-not-change-existing-auth-token'
 ) -join [Environment]::NewLine
 [IO.File]::WriteAllText($EnvFile,$original+[Environment]::NewLine)
 $state=[pscustomobject]@{phase='READY';stageId=$stage;image=$api;ip='192.168.20.12'}
 $script:target=$tv;$script:commands=@();$script:failOnce=$false
 function Get-OnlineVenueReleaseSha{return $script:target}
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
  if($script:failOnce){$script:failOnce=$false;throw 'Simulated TV gateway restart failure'}
 }
 Update-ReadyVenueTv $state
 $cfg=Read-Env
 if($cfg['VENUE_TV_IMAGE_TAG'] -ne $tv -or $cfg['VENUE_IMAGE_TAG'] -ne $api -or
  $cfg['VENUE_STAGE_ID'] -ne $stage -or $cfg['VENUE_JWT_SECRET'] -ne 'do-not-change-existing-auth-token'){
  throw 'LIVE upgrade modified the pinned stage, API, JWT or did not write TV version'
 }
 $commands=$script:commands -join ';'
 if($commands -notmatch ('frontend:'+$tv) -or $commands -notmatch '--no-deps' -or
  $commands -notmatch 'tv gateway' -or $commands -match 'down|--volumes|migrate|\bdb\b|\bapi\b'){
  throw ('LIVE upgrade touched more than TV/gateway: '+$commands)
 }
 # An offline reinstall must retain the last verified TV and never pull.
 $script:commands=@();$script:target=$null
 Update-ReadyVenueTv $state
 if((Read-Env)['VENUE_TV_IMAGE_TAG'] -ne $tv -or
  ($script:commands -join ';') -match 'docker pull'){
  throw 'Offline reinstall changed or re-downloaded installed TV'
 }
 # Failed rollout rolls back the exact prior .env without touching data.
 $script:commands=@();$script:target=$next;$script:failOnce=$true
 $rejected=$false
 try{Update-ReadyVenueTv $state}catch{$rejected=($ERROR[0].Exception.Message -match 'LIVE')}
 if(!$rejected -or (Read-Env)['VENUE_TV_IMAGE_TAG'] -ne $tv){
  throw 'Failed TV upgrade did not preserve the previous known working image'
 }
 Write-Host 'USD TV UPGRADE PASS: READY phase updates only spectator frontend/gateway, rollback preserves stage and secrets'
}finally{
 $Root=$oldRoot;$EnvFile=$oldEnvFile
 if(Test-Path -LiteralPath $folder){[IO.Directory]::Delete($folder,$true)}
}
