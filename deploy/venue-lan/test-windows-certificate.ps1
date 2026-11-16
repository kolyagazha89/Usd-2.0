#requires -Version 5.1
# Pure Windows 5.1 regression. Docker is mocked: no real containers, no writes to user files.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'venue-control.ps1') -Action certificate
$temp=Join-Path ([IO.Path]::GetTempPath()) ('usd-ca-retry-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($temp)|Out-Null
$oldRoot=$Root;$oldPrivate=$PrivateDir
try{
 $Root=$temp;$PrivateDir=Join-Path $temp 'local-private'
 [IO.Directory]::CreateDirectory($PrivateDir)|Out-Null
 $fixture=Join-Path $PSScriptRoot 'test-fixtures/public-root-ca.crt'
 $script:copyCalls=0;$script:failAll=$false
 function Get-VenueComposeArguments {return @('compose')}
 function Start-Sleep {param([int]$Seconds)}
 function docker {
  $argv=@($args)
  if($argv -contains 'ps'){
   $global:LASTEXITCODE=0
   return 'abcdef012345'
  }
  if($argv[0] -eq 'cp'){
   $script:copyCalls++
   if($script:failAll -or $script:copyCalls -lt 3){
    $global:LASTEXITCODE=1
    return
   }
   [IO.File]::Copy($fixture,[string]$argv[-1],$true)
   $global:LASTEXITCODE=0
   return
  }
  throw ('Unexpected Docker command during public CA export: '+($argv -join ' '))
 }
 Export-VenueCA
 $dest=Join-Path $PrivateDir 'USD-Venue-CA.crt'
 $share=Join-Path $Root 'USD-Venue-CA.crt'
 if($script:copyCalls -ne 3 -or !(Test-Path $dest) -or !(Test-Path $share)){
  throw 'Caddy certificate was not retried and copied to both expected folders'
 }
 if([IO.File]::ReadAllText($dest) -cne [IO.File]::ReadAllText($fixture) -or
    [IO.File]::ReadAllText($share) -cne [IO.File]::ReadAllText($fixture)){
  throw 'Exported public root differs from the Caddy root'
 }
 # Regression from a real Windows 10 venue install: the database and API were
 # READY, but pressing "Certificate" claimed Caddy was not running. Recover
 # the gateway without deleting volumes or asking the operator to reinstall.
 $script:gatewayRunning=$false
 $script:gatewayRecoveries=0
 $script:copyCalls=2
 $script:failAll=$false
 function Invoke-Compose {
  param([string[]]$Arguments,[string]$Purpose)
  if(($Arguments -join ' ') -cne 'up -d --no-build --pull never gateway'){
   throw ('Certificate attempted unsafe Compose operation: '+($Arguments -join ' '))
  }
  $script:gatewayRecoveries++
  $script:gatewayRunning=$true
 }
 function docker {
  $argv=@($args)
  if($argv -contains 'ps'){
   $global:LASTEXITCODE=0
   if($script:gatewayRunning){return 'abcdef012345'}
   return
  }
  if($argv[0] -eq 'cp'){
   $script:copyCalls++
   if($script:failAll){$global:LASTEXITCODE=1;return}
   [IO.File]::Copy($fixture,[string]$argv[-1],$true)
   $global:LASTEXITCODE=0
   return
  }
  throw ('Unexpected command while recovering gateway: '+($argv -join ' '))
 }
 Export-VenueCA
 if($script:gatewayRecoveries -ne 1 -or $script:copyCalls -ne 3){
  throw 'Certificate button did not automatically recover the stopped gateway'
 }
 Export-VenueCA
 if($script:gatewayRecoveries -ne 1){
  throw 'Certificate export unnecessarily recreated an already running gateway'
 }
 $previous=[IO.File]::ReadAllText($dest)
 $script:failAll=$true
 $failed=$false
 try{Export-VenueCA}catch{$failed=$true}
 if(!$failed -or [IO.File]::ReadAllText($dest) -cne $previous){
  throw 'CA refresh failure erased the last valid public certificate'
 }
 Write-Host 'USD WINDOWS CA PASS: Caddy retries, verified root, two files, no data loss on error'
}finally{
 $Root=$oldRoot;$PrivateDir=$oldPrivate
 [IO.Directory]::Delete($temp,$true)
}
