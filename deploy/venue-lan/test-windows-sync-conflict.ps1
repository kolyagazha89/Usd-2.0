#requires -Version 5.1
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.Net.Http

# Load the actual script functions without opening WPF or reaching Docker.
foreach($source in @('venue-control.ps1','venue-sync-http.ps1','USD-Control.ps1')){
 $tokens=$null;$errors=$null
 $tree=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $source),[ref]$tokens,[ref]$errors)
 if($errors.Count){throw ($errors -join "`n")}
 $definitions=$tree.FindAll({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and
  $node.Name -in @('Get-VenueSyncHttpError','Get-VenueSyncTransportCode','Assert-VenueSyncAck','Invoke-VenueSyncTransport','Restore-VenueApi','Return-Online','Get-UsdFailure')},$false)
 foreach($definition in $definitions){. ([scriptblock]::Create($definition.Extent.Text))}
}

$privateText='private text from the server'
$refusal=Get-VenueSyncHttpError 409 ('{"code":"RESULTS_ALREADY_PUBLISHED","message":"'+$privateText+'"}')
$display=Get-UsdFailure $refusal
if($display[0] -notmatch 'уже опубликованы' -or $display[1] -notmatch 'Скрыть результаты' -or $refusal.Contains($privateText)){
 throw 'Published-stage error did not guide the operator or exposed the response body'
}
$review='c510f672-79f7-44eb-8173-2a8ff94b1c0e'
foreach($data in @(
 @{code='RETURN_REVIEW_PENDING';reviewId=$review;message=$privateText},
 @{message=('MANUAL_REVIEW: решение администратора ещё не принято. Заявка '+$review)}
)){
 $errorText=Get-VenueSyncHttpError 409 (ConvertTo-Json $data -Compress)
 if(!$errorText.Contains($review) -or $errorText.Contains($privateText) -or (Get-UsdFailure $errorText)[1] -notmatch 'Офлайн-сервер'){
  throw 'Current or legacy identity-review error was lost or exposed an arbitrary body'
 }
}
foreach($body in @('<html>'+ $privateText +'</html>','{"code":"'+$privateText+'"}',
 '{"code":"RETURN_REVIEW_PENDING","reviewId":"'+$privateText+'"}')){
 $errorText=Get-VenueSyncHttpError 409 $body
 if(!$errorText.Contains('HTTP 409') -or $errorText.Contains($privateText)){throw 'Unknown server error was not sanitized'}
}
foreach($fixture in @(
 @{Body=@{message='Центральная база недоступна'};Code='RETURN_DB_UNAVAILABLE';Text='подключиться к центральной базе'},
 @{Body=@{message='Безопасный импорт не завершён; повторите попытку'};Code='RETURN_WRITE_FAILED';Text='запись журнала'},
 @{Body=@{message='Неполная сверка журнала; локальные данные сохранены'};Code='RETURN_RECEIPT_MISMATCH';Text='всех операций'},
 @{Body=@{message='База сохранена, пересчёт не подтверждён; повторите синхронизацию'};Code='RETURN_FINALIZE_FAILED';Text='пересчёт'},
 @{Body=@{code='RETURN_ACK_FAILED';message=$privateText};Code='RETURN_ACK_FAILED';Text='результаты пересчитаны'}
)){
 $errorText=Get-VenueSyncHttpError 503 (ConvertTo-Json $fixture.Body -Compress)
 if(!$errorText.Contains($fixture.Code) -or !$errorText.Contains('HTTP 503') -or
  $errorText.Contains($privateText) -or (Get-UsdFailure $errorText)[0] -notmatch $fixture.Text){
  throw ('Sync failure phase was not preserved: '+$fixture.Code)
 }
}
$safeCode=Get-VenueSyncHttpError 503 '{"code":"RETURN_WRITE_FAILED","databaseCode":"23503"}'
$unsafeCode=Get-VenueSyncHttpError 503 ('{"code":"RETURN_WRITE_FAILED","databaseCode":"'+$privateText+'"}')
if(!$safeCode.Contains('23503') -or $unsafeCode.Contains($privateText)){throw 'Unsafe database diagnostics'}

$expectedAck=@{stageId=$review;journalEndHash=('a'*64)}
$correctAck=[pscustomobject]@{accepted=$true;databaseSynchronized=$true;derivedRankingsRebuilt=$true;
 stageId=$review;journalEndHash=('a'*64)}
Assert-VenueSyncAck $correctAck $expectedAck
foreach($badAck in @($null,[pscustomobject]@{accepted=$true},
 [pscustomobject]@{accepted='true';databaseSynchronized=$true;derivedRankingsRebuilt=$true;stageId=$review;journalEndHash=('a'*64)},
 [pscustomobject]@{accepted=$true;databaseSynchronized=$true;derivedRankingsRebuilt=$true;stageId=$review;journalEndHash=('b'*64)})){
 try{Assert-VenueSyncAck $badAck $expectedAck;throw 'An invalid ACK was accepted'}
 catch{if($_.Exception.Message -notmatch '^\[RETURN_BAD_ACK\]'){throw}}
}

foreach($sample in @(
 @{Status='NameResolutionFailure';Code='RETURN_NETWORK_DNS'},
 @{Status='TrustFailure';Code='RETURN_NETWORK_TLS'},
 @{Status='ProxyNameResolutionFailure';Code='RETURN_NETWORK_PROXY'},
 @{Status='ReceiveFailure';Code='RETURN_CONNECTION_LOST'}
)){
 $inner=[Net.WebException]::new($privateText,([Net.WebExceptionStatus]$sample.Status))
 $wrapper=[InvalidOperationException]::new($privateText,[Net.Http.HttpRequestException]::new($privateText,$inner))
 if((Get-VenueSyncTransportCode $wrapper) -ne $sample.Code){throw ('Lost Windows network classification '+$sample.Status)}
}

# Use an actual HTTP connection. The first server connection receives the
# complete encrypted payload and closes without sending an acknowledgement.
$work=Join-Path ([IO.Path]::GetTempPath()) ('usd-venue-sync-'+[guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($work)
$scriptFile=Join-Path $work 'server.cjs'
$portFile=Join-Path $work 'port'
[IO.File]::WriteAllText($scriptFile,@'
const http = require('node:http');
const fs = require('node:fs');
const counts = new Map();
const payloads = new Map();
const server = http.createServer((req, res) => {
 const chunks = [];
 req.on('data', chunk => chunks.push(chunk));
 req.on('end', () => {
  const body = Buffer.concat(chunks).toString('utf8');
  const attempts = (counts.get(req.url) ?? 0) + 1;
  counts.set(req.url, attempts);
  if (req.method !== 'POST' || req.headers.authorization !== 'Venue ' + 'x'.repeat(43)
   || req.headers.expect || (payloads.has(req.url) && payloads.get(req.url) !== body)) {
   res.writeHead(500).end('unexpected request');
   return;
  }
  payloads.set(req.url, body);
  if (req.url === '/drop' && attempts === 1) { req.socket.destroy(); return; }
  if (req.url === '/gateway' && attempts === 1) { res.writeHead(502).end(); return; }
  if (req.url === '/conflict') {
   res.writeHead(attempts === 1 ? 409 : 500).end('{"code":"CAR_REGISTRATION_EXISTS"}');
   return;
  }
  if (req.url === '/malformed') { res.writeHead(200).end('<html>gateway</html>'); return; }
  res.writeHead(201, {'Content-Type': 'application/json'}).end(JSON.stringify({attempts}));
 });
});
server.listen(0, '127.0.0.1', () => fs.writeFileSync(process.argv[2], String(server.address().port)));
'@)
$process=$null;$client=$null
try{
 $node=(Get-Command node -CommandType Application | Select-Object -First 1).Source
 $process=Start-Process -FilePath $node -ArgumentList ('"'+$scriptFile+'" "'+$portFile+'"') -PassThru
 for($tick=0;$tick -lt 100 -and !(Test-Path -LiteralPath $portFile);$tick++){Start-Sleep -Milliseconds 100}
 if(!(Test-Path -LiteralPath $portFile)){throw 'Fixture did not start'}
 $base='http://127.0.0.1:'+([IO.File]::ReadAllText($portFile))
 $client=[Net.Http.HttpClient]::new()
 $body='{"envelope":"'+('a'*70000)+'"}'
 foreach($path in @('/drop','/gateway')){
  if((Invoke-VenueSyncTransport $client ($base+$path) $body ('x'*43)).attempts -ne 2){throw 'Retry did not send the same envelope exactly twice'}
 }
 foreach($fixture in @(@{Path='/conflict';Code='CAR_REGISTRATION_EXISTS'},@{Path='/malformed';Code='RETURN_BAD_ACK'})){
  try{Invoke-VenueSyncTransport $client ($base+$fixture.Path) $body ('x'*43);throw 'Invalid response accepted'}
  catch{if(!$_.Exception.Message.Contains('['+$fixture.Code+']')){throw}}
 }
}finally{
 if($client){$client.Dispose()}
 if($process -and !$process.HasExited){$process.Kill();$process.WaitForExit()}
 if($process){$process.Dispose()}
 Remove-Item -LiteralPath $work -Recurse -Force
}

$Silent=$false
function Read-State {return [pscustomobject]@{phase='READY';stageId=$review}}
function Export-VenueReturn {
 param([switch]$LeaveApiStopped,[switch]$Automatic)
 if(!$LeaveApiStopped -or !$Automatic){throw 'Sync did not preserve the signed automatic backup flow'}
 return [pscustomobject]@{stageId=$review;apiPaused=$script:ApiPaused}
}
function Sync-VenueReturn($Bundle){throw $refusal}
function Set-VenueStep($Step){}
function Test-IsActiveVenueStage($StageId){return $script:StageIsActive}
function Remove-Autostart {throw 'Rejected sync touched autostart'}
function Invoke-Compose([string[]]$Arguments,[string]$Purpose){
 $script:ComposeCalls+=,($Arguments -join ' ')
}
foreach($fixture in @(
 @{Active=$true;Paused=$true;Count=1},
 @{Active=$true;Paused=$false;Count=0},
 @{Active=$false;Paused=$false;Count=0}
)){
 $script:StageIsActive=$fixture.Active;$script:ApiPaused=$fixture.Paused;$script:ComposeCalls=@()
 try{Return-Online;throw 'Sync falsely reported success'}catch{if($_.Exception.Message -cne $refusal){throw}}
 if($script:ComposeCalls.Count -ne $fixture.Count -or
  ($fixture.Count -eq 1 -and $script:ComposeCalls[0] -cne 'up -d --no-deps --no-build --pull never api')){
  throw 'Rejected sync changed the database container or the previous API state'
 }
}
Write-Host 'USD SYNC CONFLICT PASS: published protocol and review reasons, protected database, prior API state'
