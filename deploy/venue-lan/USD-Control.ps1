#requires -Version 5.1
# USD LAN operator application. All online credentials remain in memory only.
# The existing venue-control.ps1 remains the sole owner of Docker/DB operations.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Net.Http
[System.System.Windows.Forms.Application]::EnableVisualStyles()
$script:Root=$PSScriptRoot
$script:ApiRoot='https://api.usd-russia.ru'
$script:Worker=$null
$script:Form=$null
$script:Status=$null
$script:StageStatus=$null
$script:Buttons=@()

function Show-UsdError([string]$Message){
 [void][System.System.Windows.Forms.MessageBox]::Show($Message,'USD — Офлайн-сервер','OK','Warning')
}
function Get-InstalledStage {
 $file=Join-Path (Join-Path $script:Root 'local-private') 'setup-state.json'
 if(!(Test-Path -LiteralPath $file -PathType Leaf)){return $null}
 $state=Get-Content -LiteralPath $file -Raw -Encoding UTF8|ConvertFrom-Json
 if([string]$state.stageId -cnotmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'){
  throw 'Неправильное состояние локального этапа. Не удаляйте Docker-тома.'
 }
 return $state
}
function Send-UsdApi([string]$Method,[string]$Path,[object]$Body=$null,[string]$Token='',[switch]$Raw){
 # Fixed official TLS origin: no arbitrary URLs, proxies selected from data, or HTTP redirects.
 if($Path -cnotmatch '^/(auth/login|stages|stages/venue/setup|stages/venue/[0-9a-f-]{36}/staff-export)$' -or
    $Method -cnotin @('GET','POST') -or
    ($Path -eq '/auth/login' -and $Method -ne 'POST') -or
    ($Path -match '/staff-export$' -and $Method -ne 'POST')){
  throw 'Недопустимый запрос к онлайн-USD'
 }
 if(!$Token -and $Path -ne '/auth/login'){throw 'Требуется вход администратора'}
 $handler=[System.Net.Http.HttpClientHandler]::new()
 $handler.AllowAutoRedirect=$false
 $handler.UseCookies=$false
 $client=[System.Net.Http.HttpClient]::new($handler)
 $client.Timeout=[TimeSpan]::FromSeconds(35)
 $request=$null;$response=$null;$inputStream=$null;$bufferStream=$null
 try{
  $verb=if($Method -eq 'POST'){[System.Net.Http.HttpMethod]::Post}else{[System.Net.Http.HttpMethod]::Get}
  $request=[System.Net.Http.HttpRequestMessage]::new($verb,[Uri]($script:ApiRoot+$Path))
  if($Token){$request.Headers.Authorization=[System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer',$Token)}
  [void]$request.Headers.TryAddWithoutValidation('Cache-Control','no-store')
  if($Method -eq 'POST'){
   $bodyText=if($null -eq $Body){'{}'}else{ConvertTo-Json -InputObject $Body -Depth 8 -Compress}
   $request.Content=[System.Net.Http.StringContent]::new($bodyText,[Text.Encoding]::UTF8,'application/json')
  }
  $response=$client.SendAsync($request,[System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
  if([int]$response.StatusCode -notin @(200,201)){
   throw ('Онлайн-сервер отказал (HTTP '+[int]$response.StatusCode+'). Нужен доступ ADMIN.')
  }
  $maxSize=13*1024*1024
  if($response.Content.Headers.ContentLength -gt $maxSize){throw 'Пакет слишком большой'}
  $inputStream=$response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
  $bufferStream=[IO.MemoryStream]::new()
  $buffer=New-Object byte[] 8192
  while(($read=$inputStream.Read($buffer,0,$buffer.Length)) -gt 0){
   if($bufferStream.Length+$read -gt $maxSize){throw 'Пакет превысил лимит размера'}
   $bufferStream.Write($buffer,0,$read)
  }
  $responseText=[Text.Encoding]::UTF8.GetString($bufferStream.ToArray())
  if($Raw){return $responseText}
  return ($responseText|ConvertFrom-Json)
 }finally{
  if($null -ne $bufferStream){$bufferStream.Dispose()}
  if($null -ne $inputStream){$inputStream.Dispose()}
  if($null -ne $response){$response.Dispose()}
  if($null -ne $request){$request.Dispose()}
  $client.Dispose()
 }
}
function Get-AdminCredentials {
 $window=New-Object System.Windows.Forms.Form
 $window.Text='Авторизация ADMIN в USD'
 $window.Size=New-Object System.Drawing.Size(490,265)
 $window.StartPosition='CenterParent';$window.FormBorderStyle='FixedDialog'
 $window.MaximizeBox=$false;$window.Font=New-Object System.Drawing.Font('Segoe UI',11)
 $label=New-Object System.Windows.Forms.Label
 $label.Text='Доступ к пакетам этапов имеет только ADMIN. Пароль не сохраняется.'
 $label.SetBounds(20,15,435,45)
 $email=New-Object System.Windows.Forms.TextBox;$email.SetBounds(20,70,435,32)
 $password=New-Object System.Windows.Forms.TextBox;$password.SetBounds(20,111,435,32)
 $password.UseSystemPasswordChar=$true
 $ok=New-Object System.Windows.Forms.Button;$ok.Text='Войти';$ok.SetBounds(200,164,120,38)
 $ok.DialogResult='OK'
 $cancel=New-Object System.Windows.Forms.Button;$cancel.Text='Отмена';$cancel.SetBounds(335,164,120,38)
 $cancel.DialogResult='Cancel'
 $window.Controls.AddRange(@($label,$email,$password,$ok,$cancel))
 $window.AcceptButton=$ok;$window.CancelButton=$cancel
 try{
  if($window.ShowDialog($script:Form) -ne 'OK'){throw 'Авторизация отменена'}
  if($email.Text -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$' -or !$password.Text){throw 'Укажите email и пароль ADMIN'}
  return [pscustomobject]@{Email=$email.Text.Trim();Password=$password.Text}
 }finally{$password.Clear();$window.Dispose()}
}
function Select-Stage([object[]]$Stages,[string]$ExcludeId=''){
 $available=@($Stages|Where-Object {
  $_.status -in @('PUBLISHED','COMPLETED') -and
  [string]$_.id -cne $ExcludeId -and
  [string]$_.id -cmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 }|Sort-Object date)
 if(!$available.Count){throw 'Нет опубликованных этапов для загрузки'}
 $window=New-Object System.Windows.Forms.Form
 $window.Text='Этап USD';$window.Size=New-Object System.Drawing.Size(570,205)
 $window.StartPosition='CenterParent';$window.FormBorderStyle='FixedDialog'
 $window.MaximizeBox=$false;$window.Font=New-Object System.Drawing.Font('Segoe UI',11)
 $label=New-Object System.Windows.Forms.Label;$label.Text='Какой этап загрузить на ноутбук?'
 $label.SetBounds(20,14,520,32)
 $options=New-Object System.Windows.Forms.ComboBox;$options.SetBounds(20,52,520,32)
 $options.DropDownStyle='DropDownList';$options.DisplayMember='Name'
 foreach($stage in $available){
  $day=try{([DateTime]$stage.date).ToString('dd.MM.yyyy')}catch{'Дата не указана'}
  [void]$options.Items.Add([pscustomobject]@{Id=[string]$stage.id;Name=([string]$stage.name+' · '+$day+' · '+[string]$stage.city)})
 }
 $options.SelectedIndex=0
 $ok=New-Object System.Windows.Forms.Button;$ok.Text='Скачать';$ok.SetBounds(275,104,120,35);$ok.DialogResult='OK'
 $cancel=New-Object System.Windows.Forms.Button;$cancel.Text='Отмена';$cancel.SetBounds(410,104,130,35);$cancel.DialogResult='Cancel'
 $window.Controls.AddRange(@($label,$options,$ok,$cancel))
 $window.AcceptButton=$ok;$window.CancelButton=$cancel
 try{
  if($window.ShowDialog($script:Form) -ne 'OK'){throw 'Выбор этапа отменён'}
  return [string]$options.SelectedItem.Id
 }finally{$window.Dispose()}
}
function New-PrivateFolder {
 $base=Join-Path $script:Root 'local-private'
 if(!(Test-Path -LiteralPath $base)){[void][IO.Directory]::CreateDirectory($base)}
 $path=Join-Path $base ('online-'+[guid]::NewGuid().ToString('N'))
 [void][IO.Directory]::CreateDirectory($path)
 $id=[Security.Principal.WindowsIdentity]::GetCurrent().User
 $acl=[Security.AccessControl.DirectorySecurity]::new()
 $acl.SetAccessRuleProtection($true,$false)
 $rule=[Security.AccessControl.FileSystemAccessRule]::new($id,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
 $acl.AddAccessRule($rule)
 [IO.Directory]::SetAccessControl($path,$acl)
 return $path
}
function Write-PrivateBundleFile([string]$Path,[string]$Value){
 $file=[IO.FileStream]::new($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
 $file.Dispose()
 $acl=[Security.AccessControl.FileSecurity]::new()
 $acl.SetAccessRuleProtection($true,$false)
 $id=[Security.Principal.WindowsIdentity]::GetCurrent().User
 $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($id,'FullControl','Allow'))
 [IO.File]::SetAccessControl($Path,$acl)
 [IO.File]::WriteAllText($Path,$Value,[Text.UTF8Encoding]::new($false))
}
# Preserve the exact JSON.stringify(snapshot) property order and ISO timestamps.
# PowerShell ConvertFrom-Json/ConvertTo-Json can change signed dates and break Ed25519.
function Extract-SignedJson([string]$Raw){
 if($Raw -cnotmatch '^\s*\{\s*"signed"\s*:'){
  throw 'Неверный формат ответа с подписанным этапом'
 }
 $colon=$Raw.IndexOf(':',$Raw.IndexOf('"signed"',[StringComparison]::Ordinal))
 $start=$colon+1
 while($start -lt $Raw.Length -and [char]::IsWhiteSpace($Raw[$start])){$start++}
 if($start -ge $Raw.Length -or $Raw[$start] -cne '{'){throw 'Нет подписанного JSON'}
 $depth=0;$quoted=$false;$escaped=$false
 for($i=$start;$i -lt $Raw.Length;$i++){
  $char=$Raw[$i]
  if($quoted){
   if($escaped){$escaped=$false}
   elseif($char -ceq '\'){$escaped=$true}
   elseif($char -ceq '"'){$quoted=$false}
   continue
  }
  if($char -ceq '"'){$quoted=$true}
  elseif($char -ceq '{'){$depth++}
  elseif($char -ceq '}'){
   $depth--
   if($depth -eq 0){return $Raw.Substring($start,$i-$start+1)}
  }
 }
 throw 'Подписанный JSON неполный'
}
function Get-OnlineStageBundle([string]$RequestedId='',[string]$ExcludeId=''){
 $credentials=Get-AdminCredentials
 $token=''
 try{
  $login=Send-UsdApi 'POST' '/auth/login' @{email=$credentials.Email;password=$credentials.Password}
  $credentials.Password=''
  if([string]$login.user.role -cne 'ADMIN'){throw 'Учётная запись не имеет права ADMIN'}
  $token=[string]$login.accessToken
  if($token -cnotmatch '^[A-Za-z0-9_.-]{60,4096}$'){throw 'Неверный токен авторизации USD'}
  $setup=Send-UsdApi 'GET' '/stages/venue/setup' $null $token
  if($setup.signing.ready -ne $true -or
     [string]$setup.signing.publicKeyPem -notmatch '^-----BEGIN PUBLIC KEY-----' -or
     [string]$setup.signing.fingerprint -cnotmatch '^[a-f0-9]{64}$'){
   throw 'Не настроен доверенный публичный ключ офлайн-USD'
  }
  $stages=@(Send-UsdApi 'GET' '/stages' $null $token)
  $id=$RequestedId
  if(!$id){$id=Select-Stage $stages $ExcludeId}
  if($id -cnotmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' -or $id -ceq $ExcludeId){
   throw 'Неверный выбор этапа'
  }
  $published=@($stages|Where-Object {[string]$_.id -ceq $id -and $_.status -in @('PUBLISHED','COMPLETED')})
  if($published.Count -ne 1){throw 'Выбранный этап ещё не опубликован'}
  $rawBundle=Send-UsdApi 'POST' ('/stages/venue/'+$id+'/staff-export') @{} $token -Raw
  $signedRaw=Extract-SignedJson $rawBundle
  $bundle=$rawBundle|ConvertFrom-Json
  if([string]$bundle.signed.snapshot.stageId -cne $id -or
     [string]$bundle.signed.integrity.algorithm -cne 'Ed25519' -or
     [string]$bundle.signed.integrity.publicKeyFingerprint -cne [string]$setup.signing.fingerprint -or
     [string]$bundle.staffKey -cnotmatch '^[A-Za-z0-9_-]{43}$' -or
     [string]$bundle.signed.snapshot.staffAccess.algorithm -cne 'AES-256-GCM' -or
     [string]$bundle.signed.snapshot.syncAuthorization.token -cnotmatch '^[A-Za-z0-9_-]{43}$'){
   throw 'Файл этапа и ключ судей не прошли предварительную проверку'
  }
  $expires=[DateTime]::Parse([string]$bundle.signed.snapshot.expiresAt).ToUniversalTime()
  if($expires -le [DateTime]::UtcNow -or $expires -gt [DateTime]::UtcNow.AddHours(72).AddMinutes(5)){
   throw 'Подписанный пакет просрочен или его срок недействителен'
  }
  # The existing Node importer cryptographically validates signature, hash and scope.
  $folder=New-PrivateFolder
  $json=Join-Path $folder 'stage.json'
  $pem=Join-Path $folder 'key.pem'
  $staff=Join-Path $folder 'staff.key'
  Write-PrivateBundleFile $json $signedRaw
  Write-PrivateBundleFile $pem ([string]$setup.signing.publicKeyPem)
  Write-PrivateBundleFile $staff ([string]$bundle.staffKey)
  return [pscustomobject]@{Id=$id;StageFile=$json;PublicKeyFile=$pem;StaffKeyFile=$staff;Fingerprint=[string]$setup.signing.fingerprint;Folder=$folder}
 }finally{$credentials.Password='';$token=''}
}
function Update-StageStatus {
 $stage=Get-InstalledStage
 $script:StageStatus.Text=if($null -eq $stage){'Пока нет установленного этапа'}else{'Этап '+[string]$stage.stageId+' · '+[string]$stage.phase}
}
function Set-Buttons([bool]$Enabled){foreach($button in $script:Buttons){$button.Enabled=$Enabled}}
function Start-UsdWorker([string]$Action,[object]$Bundle=$null){
 $manager=Join-Path $script:Root 'venue-control.ps1'
 if(!(Test-Path -LiteralPath $manager)){throw 'Отсутствует локальный управляющий скрипт USD'}
 $args='-NoProfile -ExecutionPolicy Bypass -STA -File "'+$manager+'" -Action '+$Action
 if($null -ne $Bundle){
  $args+=' -StageFile "'+$Bundle.StageFile+'"'
  $args+=' -PublicKeyFile "'+$Bundle.PublicKeyFile+'"'
  $args+=' -StaffKeyFile "'+$Bundle.StaffKeyFile+'"'
  $args+=' -TrustedFingerprint '+$Bundle.Fingerprint
 }
 $logs=New-PrivateFolder
 $out=Join-Path $logs 'output.log'
 $err=Join-Path $logs 'errors.log'
 $proc=Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList $args -PassThru -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err
 $script:Worker=[pscustomobject]@{Process=$proc;Action=$Action;Bundle=$Bundle;Output=$out;Errors=$err}
 Set-Buttons $false
 $script:Status.Text='Выполняется операция. Не выключайте ноутбук.'
 $script:Timer.Start()
}
function Invoke-OperatorAction([string]$Action){
 if($null -ne $script:Worker){return}
 try{
  if($Action -eq 'help'){Start-Process (Join-Path $script:Root 'INSTRUCTION.html');return}
  if($Action -eq 'live'){
   $stage=Get-InstalledStage
   if($null -eq $stage -or [string]$stage.ip -notmatch '^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)'){
    throw 'Локальный этап ещё не установлен'
   }
   Start-Process ('http://'+[string]$stage.ip+'/venue/live');return
  }
  $state=Get-InstalledStage
  $bundle=$null
  if($Action -eq 'next'){
   if($null -eq $state -or $state.phase -ne 'READY'){throw 'Сначала установите текущий этап'}
   $bundle=Get-OnlineStageBundle -ExcludeId ([string]$state.stageId)
  }elseif($Action -eq 'directory'){
   if($null -eq $state -or $state.phase -ne 'READY'){throw 'Сначала установите этап'}
   $bundle=Get-OnlineStageBundle -RequestedId ([string]$state.stageId)
  }elseif($Action -eq 'install' -and $null -eq $state){
   $bundle=Get-OnlineStageBundle
  }
  Start-UsdWorker -Action $Action -Bundle $bundle
 }catch{
  $script:Status.Text='Операция отменена; данные сохранены.'
  Show-UsdError $_.Exception.Message
 }
}
function Add-OperatorButton([string]$Text,[string]$Action,[int]$X,[int]$Y,[int]$Width=229){
 $button=New-Object System.Windows.Forms.Button
 $button.Text=$Text;$button.Tag=$Action
 $button.SetBounds($X,$Y,$Width,45)
 $button.BackColor=[System.Drawing.Color]::FromArgb(236,238,241)
 $button.FlatStyle='Flat'
 $button.Add_Click({Invoke-OperatorAction ([string]$this.Tag)})
 $script:Form.Controls.Add($button)
 $script:Buttons+=@($button)
}
# Native regression tests can dot-source without displaying a form.
if($MyInvocation.InvocationName -eq '.'){return}
$script:Form=New-Object System.Windows.Forms.Form
$script:Form.Text='USD — Офлайн-сервер'
$script:Form.Size=New-Object System.Drawing.Size(548,562)
$script:Form.MinimumSize=$script:Form.Size
$script:Form.MaximumSize=$script:Form.Size
$script:Form.StartPosition='CenterScreen'
$script:Form.Font=New-Object System.Drawing.Font('Segoe UI',11)
$script:Form.BackColor=[System.Drawing.Color]::White
$title=New-Object System.Windows.Forms.Label
$title.Text='USD  |  Управление этапом'
$title.Font=New-Object System.Drawing.Font('Segoe UI',17,[System.Drawing.FontStyle]::Bold)
$title.SetBounds(23,18,492,43)
$script:StageStatus=New-Object System.Windows.Forms.Label
$script:StageStatus.SetBounds(24,63,490,55)
$script:Status=New-Object System.Windows.Forms.Label
$script:Status.Text='Готово к работе'
$script:Status.SetBounds(24,466,484,52)
$script:Form.Controls.AddRange(@($title,$script:StageStatus,$script:Status))
Add-OperatorButton 'Установить / обновить' 'install' 24 132
Add-OperatorButton 'Запустить офлайн' 'offline' 270 132
Add-OperatorButton 'Синхронизация / онлайн' 'online' 24 193
Add-OperatorButton 'Экспорт результатов' 'export' 270 193
Add-OperatorButton 'Обновить профили и авто' 'directory' 24 254
Add-OperatorButton 'Следующий этап' 'next' 270 254
Add-OperatorButton 'Сертификат для судей' 'certificate' 24 315
Add-OperatorButton 'Открыть LIVE' 'live' 270 315
Add-OperatorButton 'Инструкция' 'help' 24 376 475
$info=New-Object System.Windows.Forms.Label
$info.Text='Регистрации этого этапа не обновляются кнопкой «Профили». Новый этап загружается целиком.'
$info.SetBounds(24,427,484,42)
$script:Form.Controls.Add($info)
$script:Timer=New-Object System.Windows.Forms.Timer
$script:Timer.Interval=1000
$script:Timer.Add_Tick({
 if($null -eq $script:Worker){return}
 $job=$script:Worker
 $job.Process.Refresh()
 if(!$job.Process.HasExited){
  try{
   $steps=@(Get-Content -LiteralPath $job.Output -Tail 5|Where-Object {$_ -match '^USD VENUE STEP:'})
   if($steps.Count){$script:Status.Text=$steps[-1]}
  }catch{}
  return
 }
 $script:Timer.Stop()
 $code=$job.Process.ExitCode
 $job.Process.Dispose()
 $script:Worker=$null
 Set-Buttons $true
 if($code -eq 0){
  $script:Status.Text='Готово: '+$job.Action
  Update-StageStatus
  if($null -ne $job.Bundle){
   try{Remove-Item -LiteralPath $job.Bundle.Folder -Recurse -Force}catch{}
  }
  if($job.Action -eq 'next'){
   Show-UsdError 'Следующий этап установлен. Откройте обновлённый ярлык «USD — Офлайн-сервер» на рабочем столе.'
  }
 }else{
  $script:Status.Text='Не удалось выполнить операцию. Данные сохранены.'
  $tail=@()
  try{$tail=@(Get-Content -LiteralPath $job.Errors -Tail 6)}catch{}
  if(!$tail.Count){try{$tail=@(Get-Content -LiteralPath $job.Output -Tail 6)}catch{}}
  Show-UsdError ('Ошибка USD. Журнал: '+$job.Output+[Environment]::NewLine+($tail -join [Environment]::NewLine))
 }
})
$script:Form.Add_FormClosing({
 if($null -ne $script:Worker){$_.Cancel=$true;Show-UsdError 'Операция ещё идёт. Дождитесь её завершения.'}
})
try{Update-StageStatus;[void]$script:Form.ShowDialog()}
finally{$script:Timer.Stop();$script:Timer.Dispose();$script:Form.Dispose()}
