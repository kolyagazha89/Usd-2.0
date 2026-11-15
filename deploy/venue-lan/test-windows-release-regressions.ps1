# Native Windows PS5.1: exercise the actual release probe and Compose config.
$ErrorActionPreference='Stop'
$nativeDocker=(Get-Command docker -CommandType Application -ErrorAction Stop).Source
. (Join-Path $PSScriptRoot 'venue-control.ps1') -Action install
$sha='a'*40
$temp=Join-Path ([IO.Path]::GetTempPath()) ('usd-release-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp|Out-Null
$originalRoot=$Root;$originalEnv=$EnvFile
try{
 # A Docker stdin stub still executes the real JS through native node.exe.
 $shim=Join-Path $temp 'mock-image.cjs'
 [IO.File]::WriteAllText($shim,@'
const fs=require('node:fs');
const read=fs.readFileSync;
fs.existsSync=p=>String(p).startsWith('/app/');
fs.readFileSync=(p,...rest)=>String(p)==='/app/usd-release.json'?JSON.stringify({revision:'a'.repeat(40)}):String(p).startsWith('/app/')?'venue_private.active_stage':read(p,...rest);
'@)
 function docker {
  if($args[0] -eq 'image'){$global:LASTEXITCODE=0;return $sha}
  if($args -contains '-e'){throw 'Release JS must use stdin, not native -e argument quoting'}
  if($args -notcontains '-i' -or $args -notcontains '-') {throw 'Missing native stdin flags'}
  ($input -join [Environment]::NewLine)|& node --require $shim - $sha
  if($LASTEXITCODE -ne 0){throw 'Actual release-probe JS failed in native node'}
 }
 Assert-VenueReleaseImages $sha
 Remove-Item Function:\docker
 # A caller in A must not override B with A/.env. Compose config needs no daemon.
 $caller=Join-Path $temp 'A';$Root=Join-Path $temp 'B';$EnvFile=Join-Path $Root '.env'
 New-Item -ItemType Directory -Path $caller,$Root|Out-Null
 [IO.File]::WriteAllText((Join-Path $caller '.env'),'VENUE_STAGE_ID=wrong-stage')
 [IO.File]::WriteAllText($EnvFile,'VENUE_STAGE_ID=correct-stage')
 [IO.File]::WriteAllText((Join-Path $Root 'compose.yaml'),@'
services:
  api:
    image: test:local
    environment:
      VENUE_STAGE_ID: ${VENUE_STAGE_ID}
'@)
 function Get-VenueProject {return 'usd-venue-native-regression'}
 Push-Location $caller
 try{
  $composeArgs=Get-VenueComposeArguments
  $config=& $nativeDocker @composeArgs config --format json
  if($LASTEXITCODE -ne 0){throw 'Native Compose config failed'}
  $parsed=($config -join [Environment]::NewLine)|ConvertFrom-Json
  if($parsed.services.api.environment.VENUE_STAGE_ID -cne 'correct-stage'){throw 'Caller .env overrode selected workspace'}
 }finally{Pop-Location}
 # Reads must start an existing DB without reconciling bind mounts or images.
 function Invoke-Compose([string[]]$Arguments,[string]$Purpose){
  if(($Arguments -join ' ') -cne 'start --wait db'){throw 'Database read would recreate the running service'}
 }
 Start-VenueDatabase
 Write-Host 'USD NATIVE RELEASE PASS: stdin JS, selected env, no DB recreation'
}finally{
 $Root=$originalRoot;$EnvFile=$originalEnv
 Remove-Item -LiteralPath $temp -Recurse -Force
}
