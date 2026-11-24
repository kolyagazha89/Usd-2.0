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

function Send-VenueSyncPackage([string]$Body,[string]$Token){
 Add-Type -AssemblyName System.Net.Http
 [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
 $handler=[Net.Http.HttpClientHandler]::new()
 $handler.AllowAutoRedirect=$false
 $handler.UseCookies=$false
 $client=[Net.Http.HttpClient]::new($handler)
 $client.Timeout=[TimeSpan]::FromSeconds(180)
 $client.MaxResponseContentBufferSize=64KB
 $request=[Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::Post,'https://api.usd-russia.ru/stages/venue/sync')
 $request.Headers.Authorization=[Net.Http.Headers.AuthenticationHeaderValue]::new('Venue',$token)
 $request.Content=[Net.Http.StringContent]::new($body,[Text.Encoding]::UTF8,'application/json')
 $response=$null
 try{
  $response=$client.SendAsync($request).GetAwaiter().GetResult()
  $responseText=$response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  if(!$response.IsSuccessStatusCode){throw (Get-VenueSyncHttpError ([int]$response.StatusCode) $responseText)}
  return ($responseText|ConvertFrom-Json -ErrorAction Stop)
 }finally{
  if($response){$response.Dispose()}
  $request.Dispose()
  $client.Dispose()
 }
}
