#requires -Version 5.1
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'venue-control.ps1') -Action install
function docker {
 'ordinary Docker progress output'
 $global:LASTEXITCODE=0
}
$result=@(Invoke-Docker @('version') 'test')
if($result.Count -ne 0){throw 'Docker stdout polluted a function return value'}
function New-TestState {
 Invoke-Docker @('pull','fake') 'test'
 return [pscustomobject]@{phase='CONFIGURED';stageId='test'}
}
$state=New-TestState
if($state -is [array] -or $state.phase -ne 'CONFIGURED'){throw 'Setup state polluted with command output'}
function docker {$global:LASTEXITCODE=1}
$failed=$false
try{Invoke-Docker @('version') 'test'}catch{$failed=$true}
if(!$failed){throw 'Failed native command was accepted'}
Write-Host 'Windows helper runtime tests passed; no Docker, firewall or database was modified.'
