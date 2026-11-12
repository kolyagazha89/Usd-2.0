#requires -Version 5.1
# One-time UAC-only rule. Public profiles and arbitrary IPs are rejected.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Ip)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if($Ip -notmatch '^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2[0-9]|3[01])\.\d{1,3}\.\d{1,3})$'){
 throw 'Only an RFC1918 private LAN IPv4 address may be used.'
}
$interface=Get-NetIPAddress -AddressFamily IPv4|Where-Object {
 $_.IPAddress -eq $Ip -and $_.AddressState -eq 'Preferred'
}|Select-Object -First 1
if(-not $interface){throw 'Private IP must belong to this laptop.'}
$network=Get-NetConnectionProfile -InterfaceIndex $interface.InterfaceIndex -ErrorAction Stop
if($network.NetworkCategory -ne 'Private'){
 throw 'Change the dedicated judges Wi-Fi network to Private in Windows Settings first.'
}
$name='USD Venue HTTPS '+$Ip
$prior=Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue
if($prior){return}
New-NetFirewallRule -DisplayName $name -Direction Inbound -Action Allow -Enabled True -Profile Private -Protocol TCP -LocalPort 443 -LocalAddress $Ip -RemoteAddress LocalSubnet | Out-Null
