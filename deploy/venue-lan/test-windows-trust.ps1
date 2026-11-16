#requires -Version 5.1
# Only opt-in, CurrentUser certificate trust. This test never touches the real Windows certificate store.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'venue-control.ps1') -Action certificate
$fixture=Join-Path $PSScriptRoot 'test-fixtures/public-root-ca.crt'
$script:trustInstalled=$false
$script:consent=$true
$script:consentCalls=0
$script:importCalls=0
function Get-Item {
 param([string]$LiteralPath,[string]$ErrorAction)
 if($LiteralPath -notlike 'Cert:\CurrentUser\Root\*'){throw ('Unexpected certificate store '+$LiteralPath)}
 if($script:trustInstalled){return [pscustomobject]@{Thumbprint='fixture'}}
}
function Confirm-VenueAction {
 param([string]$Text)
 $script:consentCalls++
 if($Text -notmatch 'CurrentUser|текущ|пользоват'){throw 'Consent does not explain local user trust'}
 return $script:consent
}
function Import-Certificate {
 param([string]$FilePath,[string]$CertStoreLocation,[string]$ErrorAction)
 if($FilePath -ne $fixture -or $CertStoreLocation -cne 'Cert:\CurrentUser\Root'){
  throw 'Unsafe certificate installation scope'
 }
 $script:importCalls++
 $script:trustInstalled=$true
}
Trust-VenueWindowsCertificate -File $fixture
if($script:importCalls -ne 1 -or $script:consentCalls -ne 1){throw 'Expected one approved CurrentUser trust import'}
Trust-VenueWindowsCertificate -File $fixture
if($script:importCalls -ne 1 -or $script:consentCalls -ne 1){throw 'Existing trusted CA should not be imported or confirmed again'}
$script:trustInstalled=$false;$script:consent=$false
Trust-VenueWindowsCertificate -File $fixture
if($script:importCalls -ne 1){throw 'Declined trust unexpectedly installed CA'}
$script:consent=$true
$Silent=$true
Trust-VenueWindowsCertificate -File $fixture
if($script:importCalls -ne 1){throw 'Background autostart silently installed an unapproved root CA'}
Write-Host 'USD WINDOWS TRUST PASS: one opt-in CurrentUser import; repeat/decline/background remain safe'
