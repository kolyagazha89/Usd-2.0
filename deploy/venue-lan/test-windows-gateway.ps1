#requires -Version 5.1
# Regression: the installer must not report success when Caddy/HTTP LIVE is unavailable.
# The Certificate action must recover a stopped gateway without asking a nontechnical judge to run Offline first.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'venue-control.ps1') -Action certificate
$stage='c510f672-79f7-44eb-8173-2a8ff94b1c0e'
$script:gatewayMode='down'
$script:probePaths=@()
function Invoke-WebRequest {
 param([string]$Uri,[switch]$UseBasicParsing,[int]$TimeoutSec,[hashtable]$Headers)
 $script:probePaths+= $Uri
 if($script:gatewayMode -eq 'down'){throw 'Caddy service unavailable'}
 if($Uri -like '*/venue/live'){
  return [pscustomobject]@{StatusCode=200;Content='<!doctype html><html><body>USD LIVE</body></html>'}
 }
 if($Uri -like '*/venue-api/results/venue-live'){
  if($script:gatewayMode -eq 'bad-stage'){
   return [pscustomobject]@{StatusCode=200;Content='{"stage":{"id":"00000000-0000-4000-8000-000000000001"}}'}
  }
  return [pscustomobject]@{StatusCode=200;Content=('{"stage":{"id":"'+$stage+'"}}')}
 }
 throw ('Unexpected test request '+$Uri)
}
if(Test-VenueGatewayReady -Ip '172.20.10.3' -ExpectedStage $stage){
 throw 'Caddy unavailable but gateway readiness was accepted'
}
$script:gatewayMode='bad-stage'
if(Test-VenueGatewayReady -Ip '172.20.10.3' -ExpectedStage $stage){
 throw 'Wrong stage on local gateway was accepted'
}
$script:gatewayMode='ok'
if(-not(Test-VenueGatewayReady -Ip '172.20.10.3' -ExpectedStage $stage)){
 throw 'Correct real stage was not accepted'
}
if(@($script:probePaths|Where-Object {$_ -like 'http://172.20.10.3/venue-api/results/venue-live'}).Count -eq 0 -or
   @($script:probePaths|Where-Object {$_ -like 'http://172.20.10.3/venue/live'}).Count -eq 0){
 throw 'Gateway readiness must check the actual LAN HTTP TV page and its live stage'
}
$script:startCalls=0
$script:exportCalls=0
$script:showCalls=0
function Read-State {return [pscustomobject]@{phase='READY';stageId=$stage}}
function Ensure-DockerReady {}
function Test-IsActiveVenueStage([string]$StageId){return $StageId -eq $stage}
function Start-Local {
 param([switch]$NoUi)
 if(-not $NoUi){throw 'Certificate repair launched an unnecessary browser/dialog'}
 $script:startCalls++
}
function Export-VenueCA {
 if($script:startCalls -ne 1){throw 'Certificate export started before Caddy recovery'}
 $script:exportCalls++
}
function Show-VenueMessage {param([string]$Text) $script:showCalls++}
Download-VenueCertificate
if($script:startCalls -ne 1 -or $script:exportCalls -ne 1){
 throw 'Certificate action did not restart the gateway and export its public CA exactly once'
}
Write-Host 'USD WINDOWS GATEWAY PASS: missing and wrong-stage gateways rejected; CA action self-heals without extra UI'
