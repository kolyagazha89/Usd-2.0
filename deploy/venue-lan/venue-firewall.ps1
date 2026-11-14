#requires -Version 5.1
# Invoked once in an elevated UAC process. No public firewall rules are allowed.
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$Ip,
 [switch]$AllowPrivateProfile
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if($Ip -notmatch '^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2[0-9]|3[01])\.\d{1,3}\.\d{1,3})$'){
 exit 20
}
$interface=Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
 $_.IPAddress -eq $Ip -and $_.AddressState -eq 'Preferred'
} | Select-Object -First 1
if(!$interface){exit 20}
try{
 $network=Get-NetConnectionProfile -InterfaceIndex $interface.InterfaceIndex -ErrorAction Stop
 if([string]$network.NetworkCategory -ne 'Private'){
  if(!$AllowPrivateProfile -or [string]$network.NetworkCategory -ne 'Public'){exit 20}
  # The operator explicitly approved making this specific hotspot/router
  # connection trusted in the non-elevated Windows installer before UAC.
  try{
   Set-NetConnectionProfile -InterfaceIndex $interface.InterfaceIndex -NetworkCategory Private -ErrorAction Stop
   $network=Get-NetConnectionProfile -InterfaceIndex $interface.InterfaceIndex -ErrorAction Stop
   if([string]$network.NetworkCategory -ne 'Private'){exit 21}
  }catch{exit 21}
 }
}catch{exit 21}
$name='USD Venue HTTPS '+$Ip
function Test-Rule {
 $rules=@(Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue)
 if($rules.Count -ne 1){return $false}
 $rule=$rules[0]
 if([string]$rule.Enabled -ne 'True' -or [string]$rule.Direction -ne 'Inbound' -or
    [string]$rule.Action -ne 'Allow' -or [string]$rule.Profile -ne 'Private'){
  return $false
 }
 try {
  $ports=$rule|Get-NetFirewallPortFilter -ErrorAction Stop
  $addresses=$rule|Get-NetFirewallAddressFilter -ErrorAction Stop
  return ([string]$ports.Protocol -in @('TCP','6') -and
    [string]$ports.LocalPort -eq '443' -and
    [string]$addresses.LocalAddress -eq $Ip -and
    [string]$addresses.RemoteAddress -eq 'LocalSubnet')
 }catch{return $false}
}
if(Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue){
 if(Test-Rule){exit 0}
 exit 24
}
try{
 New-NetFirewallRule -DisplayName $name -Direction Inbound -Action Allow -Enabled True -Profile Private -Protocol TCP -LocalPort 443 -LocalAddress $Ip -RemoteAddress LocalSubnet -ErrorAction Stop | Out-Null
}catch{exit 22}
if(!(Test-Rule)){exit 23}
exit 0
