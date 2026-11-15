#requires -Version 5.1
# Windows 10: when USD installer is already Administrator, do not request UAC twice.
# No actual firewall or Docker is modified.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'venue-control.ps1') -Action install
$Root=$PSScriptRoot
$script:ruleIsSafe=$false
$script:directCalls=0
$script:extraUacCalls=0
function Get-NetIPAddress {
 param([string]$AddressFamily,[string]$ErrorAction)
 [pscustomobject]@{IPAddress='192.168.50.10';InterfaceIndex=18;AddressState='Preferred'}
}
function Get-NetConnectionProfile {
 param([int]$InterfaceIndex,[string]$ErrorAction)
 [pscustomobject]@{NetworkCategory='Private'}
}
function Get-NetFirewallRule {
 param([string]$DisplayName,[string]$ErrorAction)
 if($script:ruleIsSafe){[pscustomobject]@{Enabled='True';Direction='Inbound';Action='Allow';Profile='Private'}}
}
function Get-NetFirewallPortFilter {
 [CmdletBinding()]
 param([Parameter(ValueFromPipeline=$true)]$InputObject)
 process{[pscustomobject]@{Protocol='TCP';LocalPort='443'}}
}
function Get-NetFirewallAddressFilter {
 [CmdletBinding()]
 param([Parameter(ValueFromPipeline=$true)]$InputObject)
 process{[pscustomobject]@{LocalAddress='192.168.50.10';RemoteAddress='LocalSubnet'}}
}
function Test-VenueElevated {return $true}
function Start-Process {$script:extraUacCalls++;throw 'Unnecessary second UAC elevation on Administrator console'}
function powershell.exe {
 $argsNow=@($args)
 if($argsNow -notcontains '-NoProfile' -or $argsNow -notcontains '-File' -or
  $argsNow -notcontains '-Ip' -or $argsNow -notcontains '192.168.50.10'){
  throw 'Wrong direct firewall helper arguments'
 }
 $script:directCalls++
 $script:ruleIsSafe=$true
 $global:LASTEXITCODE=0
}
Ensure-Firewall '192.168.50.10'
Ensure-Firewall '192.168.50.10'
if($script:extraUacCalls -ne 0 -or $script:directCalls -ne 1){
 throw 'Already-admin installer should invoke its scoped firewall helper exactly once, without UAC'
}
Write-Host 'USD WINDOWS FIREWALL PASS: elevated installer avoids second UAC and timeout'
