#requires -Version 5.1
# Windows hosted runner smoke test for the REAL NetSecurity provider.
# Creates one tightly scoped temporary rule and ALWAYS removes it.
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$ip=(
 Get-NetIPAddress -AddressFamily IPv4 |
 Where-Object {$_.AddressState -eq 'Preferred' -and $_.IPAddress -match '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)'} |
 Select-Object -First 1 -ExpandProperty IPAddress
)
if(!$ip){throw 'Cannot exercise native Windows private IPv4 firewall behavior: no local RFC1918 address'}
$name='USD Venue CI '+[guid]::NewGuid().ToString('N')
$created=$false
try {
 New-NetFirewallRule -DisplayName $name -Direction Inbound -Action Allow -Enabled True -Profile Private -Protocol TCP -LocalPort 443 -LocalAddress $ip -RemoteAddress LocalSubnet -ErrorAction Stop | Out-Null
 $created=$true
 $matches=@(Get-NetFirewallRule -DisplayName $name -ErrorAction Stop)
 if($matches.Count -ne 1){throw ('Real firewall created rule but returned '+$matches.Count+' matches')}
 $r=$matches[0]
 $port=$r | Get-NetFirewallPortFilter -ErrorAction Stop
 $addr=$r | Get-NetFirewallAddressFilter -ErrorAction Stop
 $details=([ordered]@{Enabled=[string]$r.Enabled;Action=[string]$r.Action;Direction=[string]$r.Direction;Profile=[string]$r.Profile;Protocol=[string]$port.Protocol;LocalPort=[string]$port.LocalPort;LocalAddress=[string]$addr.LocalAddress;RemoteAddress=[string]$addr.RemoteAddress})
 Write-Host ('NATIVE-WINDOWS-FIREWALL-FILTERS: '+($details|ConvertTo-Json -Compress))
 if($details.Enabled -ne 'True' -or $details.Action -ne 'Allow' -or $details.Direction -ne 'Inbound' -or $details.Profile -ne 'Private' -or
  $details.Protocol -notin @('TCP','6') -or $details.LocalPort -ne '443' -or
  $details.LocalAddress -ne $ip -or $details.RemoteAddress -ne 'LocalSubnet'){
  throw 'Real native Windows firewall serialized rule differently from installer strict validator'
 }
 Write-Host 'Native Windows PowerShell NetSecurity rule matched installer safety contract'
}finally{
 if($created){Remove-NetFirewallRule -DisplayName $name -ErrorAction Stop}
}
