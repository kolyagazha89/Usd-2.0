#requires -Version 5.1
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest

# Load the actual script functions without opening WPF or reaching Docker.
foreach($source in @('venue-control.ps1','venue-sync-http.ps1','USD-Control.ps1')){
 $tokens=$null;$errors=$null
 $tree=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $source),[ref]$tokens,[ref]$errors)
 if($errors.Count){throw ($errors -join "`n")}
 $definitions=$tree.FindAll({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and
  $node.Name -in @('Get-VenueSyncHttpError','Restore-VenueApi','Return-Online','Get-UsdFailure')},$false)
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
