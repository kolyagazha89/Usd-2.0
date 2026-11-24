#requires -Version 5.1
# Native WinPS 5.1 regression: no network, Docker or production credentials.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'USD-Control.ps1')
$stage='c510f672-79f7-44eb-8173-2a8ff94b1c0e'
$fingerprint='b'*64
$staff='s'*43
$raw='{"signed":{"snapshot":{"stageId":"'+$stage+'","expiresAt":"2099-01-01T00:00:00.000Z","staffAccess":{"algorithm":"AES-256-GCM"},"syncAuthorization":{"token":"'+('t'*43)+'"}},"integrity":{"algorithm":"Ed25519","publicKeyFingerprint":"'+$fingerprint+'"}},"staffKey":"'+$staff+'","staffCount":2}'
$signed=Extract-SignedJson $raw
$start=$raw.IndexOf('{"snapshot"')
$expected=$raw.Substring($start,$raw.IndexOf(',"staffKey"')-$start)
if($signed -cne $expected){throw 'Signed JSON bytes/order were changed'}
if($signed -notmatch '2099-01-01T00:00:00.000Z'){throw 'Signed timestamp changed'}

$originalRoot=$script:Root
$temp=Join-Path ([IO.Path]::GetTempPath()) ('usd-operator-test-'+[guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($temp)
try{
 $script:Root=$temp
 function Get-AdminCredentials {return [pscustomobject]@{Email='operator@example.test';Password='test-only'}}
 function Select-Stage {param([object[]]$Stages,[string]$ExcludeId);return $stage}
 $script:Requests=New-Object System.Collections.ArrayList
 function Send-UsdApi {
  param([string]$Method,[string]$Path,[object]$Body=$null,[string]$Token='',[switch]$Raw)
  [void]$script:Requests.Add($Path)
  if($Path -eq '/auth/login'){
   return [pscustomobject]@{user=[pscustomobject]@{role='ADMIN'};accessToken=('a'*90)}
  }
  if($Path -eq '/stages/venue/setup'){
   return [pscustomobject]@{signing=[pscustomobject]@{ready=$true;fingerprint=$fingerprint;publicKeyPem=('-----BEGIN PUBLIC KEY-----'+[Environment]::NewLine+'synthetic-test-only'+[Environment]::NewLine+'-----END PUBLIC KEY-----')}}
  }
  if($Path -eq '/stages'){
   return @([pscustomobject]@{id=$stage;status='PUBLISHED';name='Test';city='Test';date='2026-12-01'})
  }
  if($Path -eq ('/stages/venue/'+$stage+'/staff-export')){return $raw}
  throw 'Unexpected online request'
 }
 $fresh=[DateTime]::UtcNow.AddHours(5).ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
 $raw=$raw.Replace('2099-01-01T00:00:00.000Z',$fresh)
 $download=Get-OnlineStageBundle
 if($download.Id -cne $stage){throw 'Wrong stage selected'}
 if([IO.File]::ReadAllText($download.StageFile) -cne (Extract-SignedJson $raw)){
  throw 'The signed snapshot was reserialized'
 }
 if([IO.File]::ReadAllText($download.StaffKeyFile) -cne $staff){throw 'Wrong staff unlock key'}
 if([IO.File]::ReadAllText($download.PublicKeyFile) -notmatch 'BEGIN PUBLIC KEY'){
  throw 'Trust key did not come from authenticated setup'
 }
 foreach($name in @($download.StageFile,$download.StaffKeyFile,$download.PublicKeyFile)){
  if(-not ([IO.File]::GetAccessControl($name)).AreAccessRulesProtected){
   throw 'Sensitive file inherited public permissions'
  }
 }
 if($script:Requests.Count -ne 4){throw 'Unexpected requests in online download'}
 function Send-UsdApi {
  param([string]$Method,[string]$Path,[object]$Body=$null,[string]$Token='',[switch]$Raw)
  if($Path -eq '/auth/login'){return [pscustomobject]@{user=[pscustomobject]@{role='JUDGE'};accessToken=('a'*90)}}
  throw 'Non-ADMIN called a protected endpoint'
 }
 try{Get-OnlineStageBundle|Out-Null;throw 'Non-ADMIN downloaded a stage'}
 catch{if($_.Exception.Message -notmatch 'ADMIN'){throw}}
 Write-Host 'USD OPERATOR: signed JSON, ADMIN guard and protected files passed'
}finally{
 $script:Root=$originalRoot
 Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
}
