#requires -Version 5.1

function Get-VenueSyncHttpError([int]$Status,[string]$ResponseText){
 $failure='Сайт USD вернул HTTP '+$Status+'. Резервная копия сохранена.'
 $requestErrors=@{400='RETURN_PACKAGE_REJECTED';401='RETURN_ACCESS_REFUSED';403='RETURN_ACCESS_REFUSED';413='RETURN_PACKAGE_TOO_LARGE';429='RETURN_RATE_LIMITED';504='RETURN_TIMEOUT'}
 if($requestErrors.ContainsKey($Status)){return $failure+' ['+$requestErrors[$Status]+']'}
 if($Status -notin @(409,503)){return $failure}
 try{$response=$ResponseText|ConvertFrom-Json -ErrorAction Stop}catch{return $failure}
 if(!$response){return $failure}
 $code=if($response.PSObject.Properties['code']){[string]$response.code}else{''}
 $reviewId=if($response.PSObject.Properties['reviewId']){[string]$response.reviewId}else{''}
 if($Status -eq 503){
  $legacy=@{
   'Центральная база недоступна'='RETURN_DB_UNAVAILABLE'
   'Безопасный импорт не завершён; повторите попытку'='RETURN_WRITE_FAILED'
   'Неполная сверка журнала; локальные данные сохранены'='RETURN_RECEIPT_MISMATCH'
   'База сохранена, пересчёт не подтверждён; повторите синхронизацию'='RETURN_FINALIZE_FAILED'
  }
  if(!$code -and $response.PSObject.Properties['message'] -and $response.message -is [string]){
   $code=$legacy[$response.message]
  }
  if($code -cin @('RETURN_DB_UNAVAILABLE','RETURN_WRITE_FAILED','RETURN_DB_BUSY','RETURN_DB_SCHEMA','RETURN_DB_PERMISSIONS','RETURN_ROW_INVALID','RETURN_RECEIPT_MISMATCH','RETURN_FINALIZE_FAILED','RETURN_ACK_FAILED')){
   $failure+=' ['+$code+']'
   if($response.PSObject.Properties['databaseCode'] -and $response.databaseCode -is [string] -and
      $response.databaseCode -cmatch '^[A-Z0-9]{5}$'){$failure+=' Код БД '+$response.databaseCode+'.'}
   if($response.PSObject.Properties['reference'] -and $response.reference -is [string] -and
      $response.reference -cmatch '^[a-f0-9]{12}$'){$failure+=' Запрос '+$response.reference+'.'}
   if($response.PSObject.Properties['eventSequence'] -and ($response.eventSequence -is [int] -or $response.eventSequence -is [long]) -and
      $response.eventSequence -gt 0){$failure+=' Запись журнала '+$response.eventSequence+'.'}
  }
  return $failure
 }
 # Accept only known codes and an opaque review reference. The HTTP error body may contain private data.
 if(!$code -and $response.PSObject.Properties['message'] -and $response.message -is [string]){
  if($response.message -cmatch '^MANUAL_REVIEW:.*Заявка ([0-9a-f-]{36})(?:\.|$)'){
   $code='RETURN_REVIEW_PENDING';$reviewId=$Matches[1]
  }elseif($response.message.StartsWith('MANUAL_REVIEW:')){$code='RETURN_REVIEW_REQUIRED'}
 }
 if($code -ceq 'RESULTS_ALREADY_PUBLISHED'){
  return '[RESULTS_ALREADY_PUBLISHED] Результаты этапа уже опубликованы. Скройте результаты в карточке этапа на сайте и повторите отправку.'
 }
 if($code -cin @('STAGE_UNAVAILABLE','JOURNAL_MISMATCH','PARTICIPANT_NOT_ELIGIBLE','CLASS_UNAVAILABLE','RESULT_ADMISSION_MISSING','START_NUMBER_TAKEN','CAR_REGISTRATION_EXISTS','RETURN_ROW_ALREADY_EXISTS','RETURN_REFERENCE_MISSING','RETURN_REVIEW_PENDING','RETURN_REVIEW_REQUIRED','RETURN_CONFLICT')){
  $failure+=' ['+$code+']'
  if($code -ceq 'RETURN_REVIEW_PENDING' -and $reviewId -cmatch '^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$'){
   $failure+=' Заявка '+$reviewId+'.'
  }
 }
 return $failure
}

function Get-VenueSyncTransportCode([Exception]$Failure){
 $fallback='RETURN_CONNECTION_LOST'
 for($cause=$Failure;$null -ne $cause;$cause=$cause.InnerException){
  if($cause -is [OperationCanceledException] -or $cause -is [TimeoutException]){return 'RETURN_TIMEOUT'}
  if($cause -is [Security.Authentication.AuthenticationException]){return 'RETURN_NETWORK_TLS'}
  if($cause -is [Net.WebException]){
   switch([string]$cause.Status){
    'NameResolutionFailure' {return 'RETURN_NETWORK_DNS'}
    'ProxyNameResolutionFailure' {return 'RETURN_NETWORK_PROXY'}
    {$_ -in @('SecureChannelFailure','TrustFailure')} {return 'RETURN_NETWORK_TLS'}
    'Timeout' {return 'RETURN_TIMEOUT'}
    'ConnectFailure' {$fallback='RETURN_NETWORK_UNAVAILABLE'}
   }
  }
  if($cause -is [Net.Sockets.SocketException]){
   switch([string]$cause.SocketErrorCode){
    {$_ -in @('HostNotFound','NoData','NoRecovery','TryAgain')} {return 'RETURN_NETWORK_DNS'}
    {$_ -in @('ConnectionRefused','HostUnreachable','NetworkDown','NetworkUnreachable')} {return 'RETURN_NETWORK_UNAVAILABLE'}
    'TimedOut' {return 'RETURN_TIMEOUT'}
   }
  }
  # Newer .NET exposes the transport category directly. Windows PowerShell
  # 5.1 reports it through WebException or SocketException instead.
  if($cause.PSObject.Properties['HttpRequestError']){
   switch([string]$cause.HttpRequestError){
    'SecureConnectionError' {return 'RETURN_NETWORK_TLS'}
    'NameResolutionError' {$fallback='RETURN_NETWORK_DNS'}
    'ProxyTunnelError' {$fallback='RETURN_NETWORK_PROXY'}
   }
  }
 }
 return $fallback
}

function Invoke-VenueSyncTransport([Net.Http.HttpClient]$Client,[Uri]$Endpoint,[string]$Body,[string]$Token){
 # Retry the same signed envelope. The server matches its journal hash and
 # can return the existing receipt when the first response was lost.
 $budget=[Threading.CancellationTokenSource]::new([TimeSpan]::FromSeconds(180))
 try{
  for($attempt=1;$attempt -le 2;$attempt++){
   if($attempt -gt 1){Start-Sleep -Milliseconds 750}
   $request=[Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::Post,$Endpoint)
   $request.Headers.Authorization=[Net.Http.Headers.AuthenticationHeaderValue]::new('Venue',$Token)
   $request.Headers.ExpectContinue=$false
   $request.Headers.ConnectionClose=$true
   $request.Content=[Net.Http.StringContent]::new($Body,[Text.Encoding]::UTF8,'application/json')
   $response=$null
   try{
    try{
     $response=$Client.SendAsync($request,$budget.Token).GetAwaiter().GetResult()
     $responseText=$response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    }catch{
     $code=Get-VenueSyncTransportCode $_.Exception
     if($attempt -eq 1 -and !$budget.IsCancellationRequested -and
      $code -in @('RETURN_CONNECTION_LOST','RETURN_NETWORK_UNAVAILABLE','RETURN_NETWORK_DNS','RETURN_TIMEOUT')){
      Write-Host 'USD VENUE STEP: retry-return-to-usd'
      continue
     }
     throw ('['+$code+'] Сайт не подтвердил получение журнала. Резервная копия сохранена.')
    }
    $status=[int]$response.StatusCode
    if($attempt -eq 1 -and !$budget.IsCancellationRequested -and $status -in @(408,502,504)){
     Write-Host 'USD VENUE STEP: retry-return-to-usd'
     continue
    }
    if(!$response.IsSuccessStatusCode){throw (Get-VenueSyncHttpError $status $responseText)}
    try{return ($responseText|ConvertFrom-Json -ErrorAction Stop)}
    catch{throw '[RETURN_BAD_ACK] Ответ сайта не содержит подтверждение в ожидаемом формате. Резервная копия сохранена.'}
   }finally{
    if($response){$response.Dispose()}
    $request.Dispose()
   }
  }
 }finally{$budget.Dispose()}
}

function Send-VenueSyncPackage([string]$Body,[string]$Token){
 Add-Type -AssemblyName System.Net.Http
 [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
 $handler=[Net.Http.HttpClientHandler]::new()
 $handler.AllowAutoRedirect=$false
 $handler.UseCookies=$false
 $client=[Net.Http.HttpClient]::new($handler)
 $client.MaxResponseContentBufferSize=64KB
 $client.Timeout=[Threading.Timeout]::InfiniteTimeSpan
 try{return (Invoke-VenueSyncTransport $client 'https://api.usd-russia.ru/stages/venue/sync' $Body $Token)}
 finally{$client.Dispose()}
}

function Assert-VenueSyncAck($Result,$Bundle){
 $failure='[RETURN_BAD_ACK] Сайт не подтвердил журнал этого этапа и пересчёт результатов. Резервная копия сохранена.'
 if($null -eq $Result){throw $failure}
 foreach($field in @('accepted','databaseSynchronized','derivedRankingsRebuilt')){
  $property=$Result.PSObject.Properties[$field]
  if(!$property -or $property.Value -isnot [bool] -or !$property.Value){throw $failure}
 }
 foreach($field in @('stageId','journalEndHash')){
  $property=$Result.PSObject.Properties[$field]
  if(!$property -or $property.Value -isnot [string] -or $property.Value -cne $Bundle.$field){throw $failure}
 }
}
