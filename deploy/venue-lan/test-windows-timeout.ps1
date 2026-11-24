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

# The Compose native stderr path must preserve its process exit code.
$shim=Join-Path ([IO.Path]::GetTempPath()) ('usd-stderr-'+[guid]::NewGuid().ToString('N')+'.cjs')
[IO.File]::WriteAllText($shim,'console.error("Container usd-venue-db-1 Started");process.exit(Number(process.argv[2]));')
try{
 function docker {& node.exe $shim $script:dockerExit}
 $script:dockerExit=0
 Invoke-Compose @('up','-d','db') 'native Compose start'
 $script:dockerExit=19
 $failed=$false
 try{Invoke-Compose @('up','-d','db') 'native Compose failure'}
 catch{$failed=$_.Exception.Data['VenueExitCode'] -eq 19}
 if(!$failed){throw 'Native stderr must preserve native exit success and failure'}
}finally{Remove-Item -LiteralPath $shim -Force}
