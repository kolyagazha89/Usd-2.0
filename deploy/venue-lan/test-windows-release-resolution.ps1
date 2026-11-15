#requires -Version 5.1
# Reproduce the actual Windows release endpoint timeout before stage selection.
# Stub only external Docker and HTTPS. Never write to real Docker or a user directory.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'venue-control.ps1') -Action install
$sha='a'*40
$second='b'*40
$script:verified=@()
$script:pulled=@()
$script:urls=@()
$script:cached=@()
$script:allowApi=$false
$script:allowFrontend=$false
function docker {
 $arguments=@($args)
 if($arguments.Count -ge 2 -and $arguments[0] -eq 'image' -and $arguments[1] -eq 'ls'){
  $global:LASTEXITCODE=0
  return $script:cached
 }
 throw 'Unexpected Docker call during immutable image discovery'
}
function Assert-VenueReleaseImages([string]$Sha){
 $script:verified+= $Sha
 if($Sha -cne $sha -and $Sha -cne $second){throw 'unverified revision'}
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
 $script:pulled+= $Arguments[1]
}
$script:cached=@('ghcr.io/kolyagazha89/usd-2.0-api:'+$sha,
 'ghcr.io/kolyagazha89/usd-2.0-api:'+('f'*40))
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
$failure=''
try{Get-VenueReleaseSha $null|Out-Null}catch{$failure=$_.Exception.Message}
if($failure -notmatch 'api.usd-russia.ru' -or $failure -notmatch 'app.usd-russia.ru' -or
 $failure -notmatch 'docker' -or $failure -notmatch 'офлайн'){
 throw ('Dual-endpoint timeout was not explained: '+$failure)
}
Write-Host 'USD RELEASE FAILURE PASS: no cache and both release endpoints timed out explains recovery'
