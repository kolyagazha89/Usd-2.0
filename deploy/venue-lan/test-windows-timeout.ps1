#requires -Version 5.1
# A deterministic failure on Windows must identify the exact failed installer operation.
# Native Docker/Desktop and host data are never touched.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'venue-control.ps1') -Action install
function Get-VenueComposeArguments {return @('compose')}
Set-VenueStep 'download-images'
function docker {throw [System.TimeoutException]::new('The wait operation timed out')}
$failure=''
try{
 Invoke-Compose @('pull') 'download signed image'
 throw 'Unexpected success'
}catch{$failure=$_.Exception.Message}
if($failure -notmatch 'download-images' -or
   $failure -notmatch 'download signed image' -or
   $failure -notmatch 'The wait operation timed out'){
 throw ('Native timeout lost its location or cause: '+$failure)
}
function docker {$global:LASTEXITCODE=28}
$failure=''
try{
 Invoke-Compose @('up','-d','db') 'start PostgreSQL'
 throw 'Unexpected success'
}catch{$failure=$_.Exception.Message}
if($failure -notmatch 'start PostgreSQL' -or $failure -notmatch 'exit 28' -or
   $failure -notmatch 'download-images'){
 throw ('Native exit failure lost context: '+$failure)
}
Write-Host 'USD WINDOWS TIMEOUT PASS: exact operation, step and underlying error retained'
