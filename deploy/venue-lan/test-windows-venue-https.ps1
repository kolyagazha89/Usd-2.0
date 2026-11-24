#requires -Version 5.1
# Exercise Windows PowerShell TLS with a local CA/intermediate and explicit IP SAN.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'venue-operator-status.ps1')

$openssl=Join-Path $env:ProgramFiles 'Git/usr/bin/openssl.exe'
if(!(Test-Path -LiteralPath $openssl -PathType Leaf)){
 $openssl=(Get-Command openssl.exe -ErrorAction Stop).Source
}
$PrivateDir=Join-Path ([IO.Path]::GetTempPath()) ('USD HTTPS fixture '+[guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($PrivateDir)
$node=$null
Push-Location $PrivateDir
try{
 function Invoke-FixtureOpenSsl([string[]]$Arguments){
  $prior=$ErrorActionPreference
  try{
   $ErrorActionPreference='Continue'
   $transcript=@(& $openssl @Arguments 2>&1)
   if($LASTEXITCODE -ne 0){throw ($transcript -join "`n")}
  }finally{$ErrorActionPreference=$prior}
 }
 function New-FixtureRoot([string]$Name,[string]$Key,[string]$Cert){
  Invoke-FixtureOpenSsl @('req','-x509','-newkey','rsa:2048','-nodes','-sha256','-days','2',
   '-subj',('/CN='+$Name),'-keyout',$Key,'-out',$Cert,
   '-addext','basicConstraints=critical,CA:TRUE,pathlen:1','-addext','keyUsage=critical,keyCertSign,cRLSign')
 }
 New-FixtureRoot 'USDTestCA' 'ca.key' 'USD-Venue-CA.crt'
 New-FixtureRoot 'USDWrongCA' 'wrong.key' 'wrong.crt'
 [IO.File]::WriteAllText((Join-Path $PrivateDir 'issuer.ext'),@'
basicConstraints=critical,CA:TRUE,pathlen:0
keyUsage=critical,keyCertSign,cRLSign
'@)
 [IO.File]::WriteAllText((Join-Path $PrivateDir 'server.ext'),@'
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=IP:127.0.0.1
'@)
 Invoke-FixtureOpenSsl @('req','-new','-newkey','rsa:2048','-nodes','-subj','/CN=USDTestIssuer',
  '-keyout','issuer.key','-out','issuer.csr')
 Invoke-FixtureOpenSsl @('x509','-req','-in','issuer.csr','-CA','USD-Venue-CA.crt',
  '-CAkey','ca.key','-set_serial','2','-sha256','-days','2','-extfile','issuer.ext','-out','issuer.crt')
 Invoke-FixtureOpenSsl @('req','-new','-newkey','rsa:2048','-nodes','-subj','/CN=USDTestEndpoint',
  '-keyout','server.key','-out','server.csr')
 Invoke-FixtureOpenSsl @('x509','-req','-in','server.csr','-CA','issuer.crt',
  '-CAkey','issuer.key','-set_serial','3','-sha256','-days','2','-extfile','server.ext','-out','server.crt')
 $mismatchExt=Join-Path $PrivateDir 'wrong-ip.ext'
 [IO.File]::WriteAllText($mismatchExt,[IO.File]::ReadAllText((Join-Path $PrivateDir 'server.ext')).Replace('IP:127.0.0.1','IP:127.0.0.2'))
 Invoke-FixtureOpenSsl @('x509','-req','-in','server.csr','-CA','issuer.crt',
  '-CAkey','issuer.key','-set_serial','4','-sha256','-days','2','-extfile',$mismatchExt,'-out','wrong-ip.crt')
 $program=Join-Path $PrivateDir 'https-fixture.cjs'
 [IO.File]::WriteAllText($program,@'
const fs=require('node:fs');
const https=require('node:https');
function handle(request,response) {
 if (request.url==='/venue-api/results/venue-live') {
   response.setHeader('Content-Type','application/json');
   response.end(JSON.stringify({stage:{id:'c510f672-79f7-44eb-8173-2a8ff94b1c0e'}}));
 } else if (request.url==='/login') {
   response.setHeader('Content-Type','text/html');
   response.end('<!doctype html><html lang="ru">USD</html>');
 } else {
   response.writeHead(404).end();
 }
}
function listen(cert, portFile) {
 const server=https.createServer({
   key:fs.readFileSync('server.key'),
   cert:fs.readFileSync(cert,'utf8')+'\n'+fs.readFileSync('issuer.crt','utf8'),
 },handle);
 server.listen(0,'127.0.0.1',()=>fs.writeFileSync(portFile,String(server.address().port)));
}
listen('server.crt','port');
listen('wrong-ip.crt','wrong-port');
'@)
 $node=Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList ('"'+$program+'"') -WorkingDirectory $PrivateDir -PassThru -WindowStyle Hidden
 $portFile=Join-Path $PrivateDir 'port'
 $wrongPortFile=Join-Path $PrivateDir 'wrong-port'
 for($attempt=0;$attempt -lt 40 -and (!(Test-Path -LiteralPath $portFile) -or !(Test-Path -LiteralPath $wrongPortFile));$attempt++){
  if($node.HasExited){throw 'Local HTTPS fixture exited before listening'}
  Start-Sleep -Milliseconds 100
 }
 $port=[int][IO.File]::ReadAllText($portFile)
 $stageId='c510f672-79f7-44eb-8173-2a8ff94b1c0e'
 if(!(Test-VenueHttpsReady '127.0.0.1' $stageId $port)){throw $script:VenueHttpsProbeReason}
 if(Test-VenueHttpsReady '127.0.0.1' 'd510f672-79f7-44eb-8173-2a8ff94b1c0e' $port){
  throw 'HTTPS readiness accepted the wrong stage'
 }
 $wrongPort=[int][IO.File]::ReadAllText($wrongPortFile)
 if(Test-VenueHttpsReady '127.0.0.1' $stageId $wrongPort){
  throw 'HTTPS readiness accepted a certificate for a different IP'
 }
 if($script:VenueHttpsProbeReason -notmatch 'TLS_IP_MISMATCH'){
  throw ('Missing IP mismatch diagnostic: '+$script:VenueHttpsProbeReason)
 }
 Copy-Item -LiteralPath (Join-Path $PrivateDir 'wrong.crt') -Destination (Join-Path $PrivateDir 'USD-Venue-CA.crt') -Force
 if(Test-VenueHttpsReady '127.0.0.1' $stageId $port){
  throw 'HTTPS readiness accepted a CA that did not sign the server certificate'
 }
 if($script:VenueHttpsProbeReason -notmatch 'TLS_CA_MISMATCH'){
  throw ('Missing Windows TLS trust failure with the wrong CA: '+$script:VenueHttpsProbeReason)
 }
 Write-Host 'USD NATIVE HTTPS PASS: Windows TLS probe trusts the pinned private CA and IP SAN; rejects wrong CA, name and stage'
}finally{
 if($node){try{if(!$node.HasExited){$node.Kill();$node.WaitForExit()}}finally{$node.Dispose()}}
 Pop-Location
 Remove-Item -LiteralPath $PrivateDir -Recurse -Force
}
