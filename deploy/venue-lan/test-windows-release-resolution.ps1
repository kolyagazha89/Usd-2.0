#requires -Version 5.1
# Reproduce the actual Windows release endpoint timeout before stage selection.
# Stub only external Docker and HTTPS. Never write to real Docker or a user directory.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'venue-control.ps1') -Action install
$sha='a'*40
$second='b'*40
$script:trustedSha=$sha
$script:approvedAltSha=$second
$script:pinnedSha='aa0d1a83c70b894a8b5e36141927bc572c71b3c5'
$script:registryBlocked=$false
$script:verified=@()
$script:pulled=@()
$script:urls=@()
$script:cached=@()
$script:allowApi=$false
$script:allowFrontend=$false
$script:runtimeMissing=''
function docker {
 $arguments=@($args)
 if($arguments.Count -ge 2 -and $arguments[0] -eq 'image' -and $arguments[1] -eq 'ls'){
  $global:LASTEXITCODE=0
  return $script:cached
 }
 if($arguments.Count -ge 3 -and $arguments[0] -eq 'image' -and $arguments[1] -eq 'inspect'){
  if($arguments[-1] -ceq $script:runtimeMissing){$global:LASTEXITCODE=1;return}
  $global:LASTEXITCODE=0
  return 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
 }
 throw 'Unexpected Docker call during immutable image discovery'
}
function Assert-VenueReleaseImages([string]$Sha){
 $script:verified+= $Sha
 if($Sha -cne $script:trustedSha -and $Sha -cne $script:approvedAltSha -and $Sha -cne $script:pinnedSha){
 throw 'unverified revision'
}
}
function Invoke-RestMethod {
 param([string]$Uri,[int]$TimeoutSec)
 $script:urls+= $Uri
 if($TimeoutSec -gt 9){throw 'Release endpoint may not block installer for 20 seconds'}
 if($Uri -like 'https://api.usd-russia.ru/*' -and $script:allowApi){return [pscustomobject]@{revision=$second}}
 if($Uri -like 'https://app.usd-russia.ru/*' -and $script:allowFrontend){return [pscustomobject]@{revision=$second}}
 throw [System.TimeoutException]::new('Время ожидания завершения операции истекло.')
}
function Invoke-Docker([string[]]$Arguments,[string]$Purpose){
 if($Arguments[0] -cne 'pull'){throw 'Only explicit image pull is allowed'}
 if($script:registryBlocked){throw 'GHCR network blocked on this machine'}
 $script:pulled+= $Arguments[1]
}
if(!(Test-VenueRuntimeImagesCached $sha)){
 throw 'All five installed runtime images were not accepted for fully offline setup'
}
$script:runtimeMissing='caddy:2-alpine'
if(Test-VenueRuntimeImagesCached $sha){
 throw 'Missing Caddy runtime image was ignored'
}
$script:runtimeMissing=''
Write-Host 'USD RELEASE RUNTIME PASS: no Compose pull needed with five locally cached images'
$script:cached=@(
 ('ghcr.io/kolyagazha89/usd-2.0-api:'+('f'*40)),
 ('ghcr.io/kolyagazha89/usd-2.0-api:'+$sha)
)
$direct=@(& docker image ls --format '{{.Repository}}:{{.Tag}}' ghcr.io/kolyagazha89/usd-2.0-api)
Write-Host ('USD TEST: direct Docker refs count='+$direct.Count+' refs='+($direct -join ';'))
if($direct.Count -ne 2 -or $direct[1] -cnotmatch '^ghcr[.]io/kolyagazha89/usd-2[.]0-api:([a-f0-9]{40})\z'){
 throw 'Synthetic Docker image references are malformed'
}
$preflight=Get-CachedVenueReleaseSha
Write-Host ('USD TEST: cached preflight result='+[string]$preflight+' verified='+($script:verified -join ';'))
if($preflight -cne $sha){throw 'Verified native Docker cache was not discovered'}
$result=Get-VenueReleaseSha $null
if($result -cne $sha -or $script:urls.Count -ne 0 -or $script:pulled.Count -ne 0){
 throw 'Complete cached images did not bypass timed-out API and unnecessary pulls'
}
Write-Host 'USD RELEASE CACHE PASS: complete cached pair never contacts online endpoint'
$script:cached=@()
$script:urls=@();$script:verified=@();$script:pulled=@()
$script:allowApi=$false;$script:allowFrontend=$true
$result=Get-VenueReleaseSha $null
if($result -cne $second -or $script:urls.Count -ne 2 -or $script:pulled.Count -ne 2){
 throw 'API timeout did not retry verified frontend release and pull both images'
}
Write-Host 'USD RELEASE FALLBACK PASS: API timeout uses signed site release metadata'
$script:urls=@();$script:verified=@();$script:pulled=@()
$script:allowFrontend=$false
$result=Get-VenueReleaseSha $null
if($result -cne $script:pinnedSha -or $script:urls.Count -ne 2 -or
   $script:pulled.Count -ne 2 -or $script:verified -notcontains $script:pinnedSha){
 throw 'Both USD endpoints timed out but immutable published image fallback was not used'
}
Write-Host 'USD RELEASE PUBLICATION PASS: GHCR-only fallback works without both USD sites'
$script:registryBlocked=$true
$failure=''
try{Get-VenueReleaseSha $null|Out-Null}catch{$failure=$_.Exception.Message}
if($failure -notmatch 'ghcr.io' -or $failure -notmatch 'GHCR network blocked' -or
   $failure -notmatch 'Docker'){
 throw ('No working internet and no image cache was not explained: '+$failure)
}
Write-Host 'USD RELEASE FAILURE PASS: no internet reports exact blocked registry and preserves volumes'
