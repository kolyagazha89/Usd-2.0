#requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
Add-Type -AssemblyName PresentationFramework,PresentationCore,WindowsBase,System.Net.Http
$script:Root=$PSScriptRoot
$script:ApiRoot='https://api.usd-russia.ru'
$script:StagePattern='^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
$script:Token=''
$script:Stages=@()
$script:Worker=$null
$script:Probe=$null
$script:Local=$null
$script:DashboardError=''
$script:State=$null
$script:Form=$null
$script:Pending=$null
$script:Archive=@()
$script:StageMetadata=@{}
$script:LaunchRoot=$PSScriptRoot

function Read-UsdJson([string]$File){
 if(Test-Path -LiteralPath $File -PathType Leaf){
  return (Get-Content -LiteralPath $File -Raw -Encoding UTF8 | ConvertFrom-Json)
 }
}
function Get-UsdProperty($Value,[string]$Name){
 if($null -ne $Value -and $Value.PSObject.Properties[$Name]){return $Value.$Name}
}
function Format-UsdDate($Value,[string]$Format='dd.MM.yyyy'){
 if($Value){try{return ([DateTimeOffset]$Value).ToLocalTime().ToString($Format)}catch{}}
 return ''
}
function Get-StageMeta($Stage){
 $season=Get-UsdProperty $Stage 'season'
 $name=[string](Get-UsdProperty $season 'name')
 if(!$name){$name=[string](Get-UsdProperty $season 'year')}
 $details=@((Get-UsdProperty $Stage 'city'),(Format-UsdDate (Get-UsdProperty $Stage 'date')),$name)
 return ($details | Where-Object {$_}) -join '  ·  '
}
function Get-InstalledStage([string]$Root=$script:Root){
 $state=Read-UsdJson (Join-Path $Root 'local-private/setup-state.json')
 if($null -eq $state){return}
 if([string]$state.stageId -cnotmatch $script:StagePattern){throw 'Файлы локального этапа повреждены.'}
 $snapshot=$null
 if((Get-UsdProperty $state 'package') -and (Test-Path -LiteralPath $state.package -PathType Leaf)){
  $file=Get-Item -LiteralPath $state.package
  $cached=$script:StageMetadata[$file.FullName]
  if(!$cached -or $cached.Length -ne $file.Length -or $cached.LastWrite -ne $file.LastWriteTimeUtc){
   $signed=Read-UsdJson $file.FullName
   $cached=[pscustomobject]@{
    Length=$file.Length;LastWrite=$file.LastWriteTimeUtc
    Id=[string]$signed.snapshot.stageId;Fingerprint=[string]$signed.integrity.publicKeyFingerprint
    Stage=$signed.snapshot.stage
    Registrations=@(Get-UsdProperty $signed.snapshot 'registrations'|Where-Object {$_}).Count
    Participants=@(Get-UsdProperty $signed.snapshot 'participantDirectory'|Where-Object {$_}).Count
   }
   $script:StageMetadata[$file.FullName]=$cached
  }
  if($cached.Id -ceq $state.stageId -and $cached.Fingerprint -ceq $state.fingerprint){$snapshot=$cached}
 }
 $state|Add-Member -NotePropertyName Snapshot -NotePropertyValue $snapshot
 return $state
}
function Get-UsdStageName($State){
 $name=[string](Get-UsdProperty (Get-UsdProperty (Get-UsdProperty $State 'Snapshot') 'stage') 'name')
 if($name){return $name}
 return 'Название этапа недоступно'
}
function Get-UsdHome {
 $home=[string](Get-UsdProperty $script:State 'home')
 if($home -and (Test-Path -LiteralPath $home -PathType Container)){return $home}
 return $script:LaunchRoot
}
function Get-LocalWorkspaces {
 $home=Get-UsdHome
 $roots=@($home,$script:Root,$script:LaunchRoot)
 $folder=Join-Path $home 'stage-workspaces'
 if(Test-Path -LiteralPath $folder -PathType Container){
  $roots+=@(Get-ChildItem -LiteralPath $folder -Directory | Where-Object {$_.Name -cmatch $script:StagePattern} | ForEach-Object {$_.FullName})
 }
 foreach($path in ($roots|Select-Object -Unique)){
  try{$state=Get-InstalledStage $path}catch{continue}
  if($state -and $state.Snapshot){
   [pscustomobject]@{Id=[string]$state.stageId;Root=$path;State=$state;Label=((Get-UsdStageName $state)+'  ·  '+(Get-StageMeta $state.Snapshot.stage))}
  }
 }
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
 [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
 $handler=[System.Net.Http.HttpClientHandler]::new()
 $handler.AllowAutoRedirect=$false
 $handler.UseCookies=$false
 $client=[System.Net.Http.HttpClient]::new($handler)
 $timeout=[Threading.CancellationTokenSource]::new([TimeSpan]::FromSeconds(45))
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
  $response=$client.SendAsync($request,[System.Net.Http.HttpCompletionOption]::ResponseHeadersRead,$timeout.Token).GetAwaiter().GetResult()
  if([int]$response.StatusCode -notin @(200,201)){
   $failure=[InvalidOperationException]::new('Онлайн-USD вернул HTTP '+[int]$response.StatusCode)
   $failure.Data['HttpStatus']=[int]$response.StatusCode
   throw $failure
  }
  $maxSize=13*1024*1024
  if($response.Content.Headers.ContentLength -gt $maxSize){throw 'Пакет слишком большой'}
  $inputStream=$response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
  $bufferStream=[IO.MemoryStream]::new()
  $buffer=New-Object byte[] 8192
  while(($read=$inputStream.ReadAsync($buffer,0,$buffer.Length,$timeout.Token).GetAwaiter().GetResult()) -gt 0){
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
  $timeout.Dispose()
  $client.Dispose()
 }
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
function Connect-UsdAdmin([object]$Credentials){
 try{
  $login=Send-UsdApi 'POST' '/auth/login' @{email=$Credentials.Email;password=$Credentials.Password}
  if([string]$login.user.role -cne 'ADMIN'){throw 'У этой учётной записи нет роли ADMIN.'}
  $token=[string]$login.accessToken
  if($token -cnotmatch '^[A-Za-z0-9_.-]{60,4096}$'){throw 'USD не вернул действительный токен авторизации.'}
  return [pscustomobject]@{Token=$token;Stages=@(Send-UsdApi 'GET' '/stages' $null $token)}
 }finally{$Credentials.Password=''}
}
function Get-OnlineStageBundle([string]$Id,[string]$Token){
 if($Id -cnotmatch $script:StagePattern){throw 'Выберите действительный этап.'}
 $setup=Send-UsdApi 'GET' '/stages/venue/setup' $null $Token
 if($setup.signing.ready -ne $true -or
    [string]$setup.signing.publicKeyPem -notmatch '^-----BEGIN PUBLIC KEY-----' -or
    [string]$setup.signing.fingerprint -cnotmatch '^[a-f0-9]{64}$'){
  throw 'На сайте USD не настроена подпись пакетов этапов.'
 }
 $rawBundle=Send-UsdApi 'POST' ('/stages/venue/'+$id+'/staff-export') @{} $Token -Raw
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
 return [pscustomobject]@{Id=$Id;StageFile=$json;PublicKeyFile=$pem;StaffKeyFile=$staff;Fingerprint=[string]$setup.signing.fingerprint;Folder=$folder}
}

function New-UsdWindow {
 return [Windows.Markup.XamlReader]::Parse([IO.File]::ReadAllText((Join-Path $script:LaunchRoot 'venue-operator.xaml')))
}
function Add-UsdChoice($List,$Choice){
 $item=if($List -is [Windows.Controls.ComboBox]){[Windows.Controls.ComboBoxItem]::new()}else{[Windows.Controls.ListBoxItem]::new()}
 $item.Content=[string]$Choice.Label
 $item.Tag=$Choice
 [void]$List.Items.Add($item)
}
function New-UsdButton([string]$Text){
 $button=[Windows.Controls.Button]::new()
 $button.Content=$Text
 $button.Padding=[Windows.Thickness]::new(13,7,13,7)
 $button.Margin=[Windows.Thickness]::new(0,8,8,0)
 $button.Style=$script:Form.FindResource([Windows.Controls.Button])
 return $button
}
function Add-UsdText($Panel,[string]$Text,[int]$Size=14){
 $label=[Windows.Controls.TextBlock]::new()
 $label.Text=$Text
 $label.TextWrapping='Wrap'
 $label.FontSize=$Size
 $label.Margin=[Windows.Thickness]::new(0,0,0,8)
 [void]$Panel.Children.Add($label)
 return $label
}
function New-UsdDialog([string]$Title,[int]$Width=510){
 $window=[Windows.Window]::new()
 $window.Owner=$script:Form
 $window.Title=$Title
 $window.WindowStartupLocation='CenterOwner'
 $window.ShowInTaskbar=$false
 $window.Width=$Width
 $window.MaxHeight=[Windows.SystemParameters]::WorkArea.Height
 $window.SizeToContent='Height'
 $window.FontSize=14
 $window.FontFamily=$script:Form.FontFamily
 $window.Background=[Windows.Media.Brushes]::White
 $window.Foreground=$script:Form.Foreground
 $content=[Windows.Controls.StackPanel]::new()
 $content.Margin=[Windows.Thickness]::new(20)
 $scroll=[Windows.Controls.ScrollViewer]::new()
 $scroll.VerticalScrollBarVisibility='Auto'
 $scroll.Content=$content
 $window.Content=$scroll
 return [pscustomobject]@{Window=$window;Panel=$content}
}
function Get-AdminCredentials {
 $dialog=New-UsdDialog 'Вход администратора USD' 420
 $panel=$dialog.Panel
 $window=$dialog.Window
 $null=Add-UsdText $panel 'Войдите с учётной записью администратора сайта.' 16
 $email=[Windows.Controls.TextBox]::new()
 $password=[Windows.Controls.PasswordBox]::new()
 foreach($field in @(@('Электронная почта',$email),@('Пароль',$password))){
  $label=[Windows.Controls.Label]::new()
  $label.Content=$field[0]
  $label.Target=$field[1]
  [void]$panel.Children.Add($label)
  $field[1].Padding=[Windows.Thickness]::new(8)
  [void]$panel.Children.Add($field[1])
 }
 $validation=Add-UsdText $panel ''
 $buttons=[Windows.Controls.WrapPanel]::new()
 [void]$panel.Children.Add($buttons)
 $ok=New-UsdButton 'Войти'
 $ok.Style=$script:Form.FindResource('Primary')
 $ok.IsDefault=$true
 $ok.Add_Click({
  if($email.Text.Trim() -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$' -or !$password.SecurePassword.Length){
   $validation.Text='Введите электронную почту и пароль.'
   return
  }
  $window.DialogResult=$true
 }.GetNewClosure())
 [void]$buttons.Children.Add($ok)
 $cancel=New-UsdButton 'Отмена'
 $cancel.IsCancel=$true
 [void]$buttons.Children.Add($cancel)
 $window.Add_Loaded({[void]$email.Focus()}.GetNewClosure())
 try{
  if($window.ShowDialog()){return [pscustomobject]@{Email=$email.Text.Trim();Password=$password.Password}}
 }finally{$password.Clear()}
}
function Show-UsdDialog([string]$Title,[string]$Message,[string]$Advice='',[string]$Details='',[switch]$Retry){
 $dialog=New-UsdDialog $Title
 $panel=$dialog.Panel
 $window=$dialog.Window
 $heading=Add-UsdText $panel $Title 20
 $heading.FontWeight='SemiBold'
 $null=Add-UsdText $panel $Message
 if($Advice){$null=Add-UsdText $panel $Advice}
 if($Details){
  $technical=[Windows.Controls.Expander]::new()
  $technical.Header='Технические подробности'
  $technicalPanel=[Windows.Controls.StackPanel]::new()
  $box=[Windows.Controls.TextBox]::new()
  $box.Text=$Details
  $box.IsReadOnly=$true
  $box.TextWrapping='Wrap'
  $box.MaxHeight=230
  $box.VerticalScrollBarVisibility='Auto'
  [void]$technicalPanel.Children.Add($box)
  $copy=New-UsdButton 'Копировать подробности'
  $copy.Add_Click({
   try{[Windows.Clipboard]::SetText($box.Text);$this.Content='Скопировано'}
   catch{$box.SelectAll();[void]$box.Focus()}
  }.GetNewClosure())
  [void]$technicalPanel.Children.Add($copy)
  $technical.Content=$technicalPanel
  [void]$panel.Children.Add($technical)
 }
 $buttons=[Windows.Controls.WrapPanel]::new()
 [void]$panel.Children.Add($buttons)
 if($Retry){
  $again=New-UsdButton 'Повторить'
  $again.Style=$script:Form.FindResource('Primary')
  $again.Add_Click({$window.DialogResult=$true}.GetNewClosure())
  [void]$buttons.Children.Add($again)
 }
 $close=New-UsdButton 'Закрыть'
 $close.IsCancel=$true
 [void]$buttons.Children.Add($close)
 return $window.ShowDialog()
}
function Confirm-UsdAction([string]$Title,[string]$Message){
 return [Windows.MessageBox]::Show($script:Form,$Message,$Title,'YesNo','Question','No') -eq 'Yes'
}

function Get-UsdFailure([string]$Reason,[int]$Http=0){
 if($Http -eq 401 -or $Reason -match '(?i)\bHTTP\s+401\b|Unauthorized'){
  return @('USD не подтвердил вход.', 'Проверьте почту и пароль. Если сеанс истёк, войдите снова.')
 }
 if($Http -eq 403 -or $Reason -match '(?i)нет роли ADMIN|\b403\b|Forbidden'){
  return @('Сайт USD отклонил запрос по правам доступа.', 'Войдите с учётной записью администратора USD. Для отправки результатов проверьте срок действия ключа этапа.')
 }
 if($Http -eq 409 -or $Reason -match '(?i)\b409\b|Conflict'){
  return @('Сайт USD обнаружил конфликт при приёме данных.', 'Откройте «Офлайн-сервер» в онлайн-админке USD и проверьте возврат этапа. Резервная копия доступна в архиве.')
 }
 if($Http -ge 500 -or $Reason -match '(?i)\b(500|502|503|504)\b'){
  return @('Сайт USD временно не смог обработать запрос.', 'Подождите несколько минут и повторите. При повторной ошибке отправьте подробности администратору USD.')
 }
 if($Reason -match '(?i)том|volume|база уже|база USD|БД|postgres|локальная база'){
  return @($Reason,'Откройте существующую установку USD. Если ошибка повторится, передайте подробности администратору USD.')
 }
 if($Reason -match '(?i)API/HTTPS|защищённый вход|Caddy|TLS|сертификат'){
  return @('Защищённый вход или локальный API пока недоступны.', 'Проверьте подключение к роутеру площадки и повторите запуск. Если ошибка повторится, откройте технические подробности.')
 }
 if($Reason -match '(?i)UAC|брандмауэр|частн.{0,3} (сеть|профиль)|Wi-Fi|роутер|LAN-правило'){
  return @($Reason,'Подключите ноутбук к роутеру площадки. Проверьте профиль сети «Частная» и подтвердите запрос Windows, если он появится.')
 }
 if($Reason -match '(?i)ист[её]к|просроч|expires'){
  return @($Reason,'Для установки войдите в USD и повторите загрузку. Для завершённого этапа сохраните резервную копию и обратитесь к администратору USD.')
 }
 if($Reason -match '(?i)timeout|timed out|превышено время|HttpRequestException|отправке запроса|task was canceled|name resolution|имя.*разреш|The underlying connection|unable to connect|GHCR'){
  return @('Сетевой запрос не завершился вовремя.', 'Проверьте интернет и повторите. Загруженный ранее этап можно запустить через Wi-Fi площадки.')
 }
 if($Reason -match '(?i)docker|compose|container|контейнер'){
  return @('Docker Desktop не завершил действие.', 'Откройте Docker Desktop, дождитесь готовности режима Linux containers и повторите операцию.')
 }
 if($Reason -match '^[А-ЯЁ]' -and $Reason.Length -lt 215){return @($Reason,'Повторите действие после устранения причины. При необходимости отправьте подробности администратору USD.')}
 return @('Программа не получила подтверждение завершения операции.', 'Откройте технические подробности, чтобы уточнить причину. При повторной ошибке передайте их администратору USD.')
}

function Start-UsdNetwork($Request,[string]$Kind){
 $pipeline=[PowerShell]::Create()
 try{
  $null=$pipeline.AddScript({
   param($ScriptFile,$Root,$Kind,$InputValue)
   . $ScriptFile
   $script:Root=$Root
   if($Kind -eq 'login'){Connect-UsdAdmin $InputValue}
   else{Get-OnlineStageBundle $InputValue.Id $InputValue.Token}
  }.ToString()).AddArgument((Join-Path $script:LaunchRoot 'USD-Control.ps1')).AddArgument($Request.Root).AddArgument($Kind).AddArgument($Request.Input)
  $handle=$pipeline.BeginInvoke()
  $script:Worker=[pscustomobject]@{Kind=$Kind;Request=$Request;Pipeline=$pipeline;Handle=$handle}
 }catch{$pipeline.Dispose();throw}
}
function Start-UsdChild([string]$Action,[string]$Root,$Bundle=$null){
 $kitRoot=if($Action -in @('export','online')){$script:LaunchRoot}else{$Root}
 $manager=Join-Path $kitRoot 'venue-control.ps1'
 if(!(Test-Path -LiteralPath $manager -PathType Leaf)){throw 'Не удалось найти файлы управления USD. Обновите программу в рабочей папке.'}
 $logsRoot=Join-Path (Join-Path $Root 'local-private') 'operations'
 if($Action -ne 'status'){[void][IO.Directory]::CreateDirectory($logsRoot)}
 $base=Join-Path $logsRoot ((Get-Date -Format 'yyyyMMdd-HHmmss-ffff')+'-'+$Action+'-'+[guid]::NewGuid().ToString('N').Substring(0,6))
 if($Action -eq 'status'){$base=Join-Path ([IO.Path]::GetTempPath()) ('usd-status-'+[guid]::NewGuid().ToString('N'))}
 $out=$base+'.log'
 $err=$base+'.err.log'
 $arguments='-NoProfile -ExecutionPolicy Bypass -STA -File "'+$manager+'" -Action '+$Action+' -Operator'
 if($kitRoot -cne $Root){$arguments+=' -Workspace "'+$Root+'"'}
 if($Bundle){
  $arguments+=' -StageFile "'+$Bundle.StageFile+'" -PublicKeyFile "'+$Bundle.PublicKeyFile+'" -StaffKeyFile "'+$Bundle.StaffKeyFile+'" -TrustedFingerprint '+$Bundle.Fingerprint
 }
 $proc=Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList $arguments -WorkingDirectory $Root -PassThru -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err
 return [pscustomobject]@{Process=$proc;Output=$out;Errors=$err;Root=$Root;Started=[DateTime]::UtcNow}
}
function Get-UsdLog($Job,[int]$Tail=100){
 $lines=@()
 foreach($file in @($Job.Output,$Job.Errors)){
  if(Test-Path -LiteralPath $file -PathType Leaf){$lines+=@(Get-Content -LiteralPath $file -Encoding UTF8 -Tail $Tail -ErrorAction SilentlyContinue)}
 }
 return $lines
}
function Remove-UsdBundle($Bundle){
 if($Bundle -and (Split-Path -Path $Bundle.Folder -Leaf) -cmatch '^online-[a-f0-9]{32}$'){
  foreach($name in @('stage.json','key.pem','staff.key','pending.json')){
   Remove-Item -LiteralPath (Join-Path $Bundle.Folder $name) -Force -ErrorAction SilentlyContinue
  }
  [IO.Directory]::Delete($Bundle.Folder)
 }
}
function Get-PendingStageBundle {
 $parent=Join-Path $script:Root 'local-private'
 if(!(Test-Path -LiteralPath $parent -PathType Container)){return}
 $folders=Get-ChildItem -LiteralPath $parent -Filter 'online-*' -Directory | Sort-Object LastWriteTimeUtc -Descending
 foreach($folder in $folders){
  $marker=Join-Path $folder.FullName 'pending.json'
  if($folder.Name -cnotmatch '^online-[a-f0-9]{32}$' -or !(Test-Path -LiteralPath $marker -PathType Leaf)){continue}
  $pending=Read-UsdJson $marker
  if($pending.Id -cnotmatch $script:StagePattern -or $pending.Fingerprint -cnotmatch '^[a-f0-9]{64}$' -or $pending.Action -cnotin @('install','next')){continue}
  $stageFile=Join-Path $folder.FullName 'stage.json'
  $payload=Read-UsdJson $stageFile
  if(!$payload -or $payload.snapshot.stageId -cne $pending.Id){continue}
  return [pscustomobject]@{
   Id=$pending.Id;Fingerprint=$pending.Fingerprint;Action=$pending.Action;Folder=$folder.FullName
   StageFile=$stageFile;PublicKeyFile=(Join-Path $folder.FullName 'key.pem');StaffKeyFile=(Join-Path $folder.FullName 'staff.key')
   Expires=([DateTimeOffset]$payload.snapshot.expiresAt);Label=(Get-UsdProperty $payload.snapshot.stage 'name')
  }
 }
}
function Set-UsdManager($Request,$Bundle=$null){
 $job=Start-UsdChild $Request.Action $Request.Root $Bundle
 $script:Worker=[pscustomobject]@{Kind='manager';Request=$Request;Job=$job;Bundle=$Bundle}
}
function New-UsdRequest([string]$Action,[string]$Label,[string]$Root=$script:Root,[string]$Id=''){
 return [pscustomobject]@{Action=$Action;Label=$Label;Root=$Root;Id=$Id;Input=$null;Bundle=$null}
}
function Start-UsdRequest($Request){
 if($script:Worker){return}
 try{
  if($Request.Action -eq 'login'){
   $Request.Input=Get-AdminCredentials
   if(!$Request.Input){return}
   Start-UsdNetwork $Request 'login'
   $ui.Notice.Text='Входим в USD и получаем список этапов…'
  }elseif($Request.Id -and !$Request.Bundle){
   if(!$script:Token){throw 'Войдите в USD, чтобы скачать подписанный пакет этапа.'}
   $Request.Input=[pscustomobject]@{Id=$Request.Id;Token=$script:Token}
   Start-UsdNetwork $Request 'download'
   $ui.Notice.Text='Программа скачивает подписанный пакет этапа…'
  }else{
   Set-UsdManager $Request $Request.Bundle
   $ui.Notice.Text=$Request.Label+'…'
  }
 }catch{Show-UsdOperationFailure $Request $_.Exception.Message $_.Exception.Message}
 Update-UsdDashboard
}
function Show-UsdOperationFailure($Request,[string]$Reason,[string]$Details,[int]$Http=0){
 if($Reason -match 'отмен[её]н'){
  $ui.Notice.Text='Действие отменено.'
  return
 }
 if($Http -eq 401 -and $Request.Action -ne 'login'){
  $script:Token=''
  $script:Stages=@()
 }
 $ui.Notice.Text='Не удалось завершить действие.'
 $failure=Get-UsdFailure $Reason $Http
 if(Show-UsdDialog ('Не удалось '+$Request.Label.ToLowerInvariant()) $failure[0] $failure[1] $Details -Retry){
  if($Http -eq 401 -and $Request.Action -ne 'login'){
   Start-UsdRequest (New-UsdRequest 'login' 'войти в USD')
  }else{Start-UsdRequest $Request}
 }
}

$script:StepLabels=@{
 'initialization'='Проверяем файлы программы'
 'check-docker'='Подключаемся к Docker Desktop'
 'select-signed-stage-and-verify-release'='Проверяем пакет и версию USD'
 'configure-firewall'='Настраиваем доступ по Wi-Fi. При необходимости подтвердите запрос Windows'
 'validate-compose'='Проверяем конфигурацию сервера'
 'check-other-stage-ports'='Проверяем свободные порты'
 'verify-stage-and-staff'='Проверяем подпись этапа и доступ судей'
 'download-images'='Проверяем образы на ноутбуке'
 'download-missing-runtime-images'='Скачиваем образы сервера'
 'prepare-media-volume'='Подготавливаем хранилище фотографий'
 'start-storage'='Запускаем локальную базу и хранилище'
 'migrate-local-db'='Подготавливаем структуру базы данных'
 'verify-local-db-roles'='Проверяем доступ к локальной базе'
 'import-signed-stage'='Загружаем участников и регистрации'
 'install-journal'='Настраиваем журнал судейских операций'
 'start-lan-services'='Запускаем админку и LIVE-табло'
 'authorize-staff'='Настраиваем вход судей'
 'check-stage-switch'='Проверяем текущий и следующий этапы'
 'start-local-database'='Проверяем сохранённую локальную базу'
 'start-local-services'='Запускаем админку и LIVE-табло'
 'verify-first-lan-readiness'='Проверяем API и защищённый вход'
 'verify-lan-readiness'='Проверяем API и HTTPS'
 'prepare-return-backup'='Подготавливаем защищённую копию результатов'
 'write-return-backup'='Сохраняем зашифрованную копию'
 'send-return-to-usd'='Отправляем результаты и ждём подтверждения сайта'
 'stop-after-ack'='Сайт подтвердил результаты. Останавливаем судейский ввод'
 'import-existing-participant-directory'='Проверяем пакет и обновляем справочник'
 'export-caddy-public-ca'='Подготавливаем публичный сертификат для судей'
 'download-current-frontend-image'='Скачиваем обновление интерфейса'
 'activate-updated-frontend'='Проверяем обновлённую админку и табло'
 'download-registration-upgrade'='Скачиваем исправление регистрации'
 'backup-registration-upgrade'='Проверяем резервную копию перед обновлением'
 'migrate-registration-upgrade'='Обновляем структуру базы'
 'activate-registration-upgrade'='Проверяем работу регистрации'
}
$script:StatusLabels=@{
 empty='Этап не загружен';preparing='Подготовка сервера';ready='Сервер готов к запуску'
 working='Офлайн-сервер работает';pending='Требуется синхронизация'
 sending='Выполняется отправка результатов';synced='Синхронизация подтверждена'
 attention='Требуется внимание';archived='Архивный этап'
}

function Format-UsdLog([object[]]$Lines){
 # Keep opaque auth values and connection strings out of copied diagnostics.
 $safe=($Lines -join [Environment]::NewLine) -replace '(?i)(Bearer|Venue|UsdSync!1-)\s*[A-Za-z0-9_.-]{40,}','$1 [скрыто]'
 return ($safe -replace '(?i)postgres(?:ql)?://\S+','[адрес базы скрыт]')
}
function Complete-UsdWorker {
 $worker=$script:Worker
 if(!$worker){return}
 $request=$worker.Request
 if($worker.Kind -ne 'manager'){
  if(!$worker.Handle.IsCompleted){return}
  $script:Worker=$null
  $failure=$null
  try{$result=@($worker.Pipeline.EndInvoke($worker.Handle))}
  catch{$failure=$_}
  finally{
   if($worker.Kind -eq 'login' -and $request.Input){$request.Input.Password=''}
   $request.Input=$null
   $worker.Pipeline.Dispose()
  }
  if($failure){
   $exception=$failure.Exception
   $http=0
   $reason=$exception.Message
   while($exception){
    if($exception.Data['HttpStatus']){$http=[int]$exception.Data['HttpStatus'];break}
    $reason=$exception.Message
    $exception=$exception.InnerException
   }
   Show-UsdOperationFailure $request $reason (Format-UsdLog @($failure.Exception.Message)) $http
  }elseif($result.Count -ne 1){
   Show-UsdOperationFailure $request 'USD вернул неполный ответ.' 'Получено неожиданное число ответов.'
  }elseif($worker.Kind -eq 'login'){
   $script:Token=[string]$result[0].Token
   $script:Stages=@($result[0].Stages)
   $ui.Notice.Text=if($script:Pending){'Вход выполнен. Продолжите загрузку этапа.'}else{'Вход выполнен. Выберите этап для загрузки.'}
  }else{
   $bundle=$result[0]
   try{
    # Download inputs survive an interrupted setup. Session credentials stay in memory.
    if($request.Action -in @('next','install')){
     Write-PrivateBundleFile (Join-Path $bundle.Folder 'pending.json') (@{Action=$request.Action;Id=$bundle.Id;Fingerprint=$bundle.Fingerprint}|ConvertTo-Json -Compress)
     if($script:Pending -and $script:Pending.Folder -ne $bundle.Folder){
      try{Remove-UsdBundle $script:Pending}catch{}
     }
    }
    $request.Bundle=$bundle
    Set-UsdManager $request $bundle
    $ui.Notice.Text=$request.Label+'…'
   }catch{Show-UsdOperationFailure $request $_.Exception.Message $_.Exception.Message}
  }
  Update-UsdDashboard
  return
 }
 $job=$worker.Job
 $job.Process.Refresh()
 if(!$job.Process.HasExited){
  $steps=@(Get-UsdLog $job -Tail 140 | Where-Object {$_ -match '^USD VENUE STEP: '})
  if($steps.Count){
   $step=$steps[-1].Substring('USD VENUE STEP: '.Length).Trim()
   if($script:StepLabels.ContainsKey($step)){$ui.Notice.Text=$script:StepLabels[$step]+'…'}
  }
  return
 }
 $code=$job.Process.ExitCode
 $job.Process.Dispose()
 $script:Worker=$null
 $lines=@(Get-UsdLog $job -Tail 120)
 $script:Local=$null
 if($code -eq 0){
  try{Remove-UsdBundle $worker.Bundle}catch{}
  $request.Bundle=$null
  $messages=@{
   install='Установка проверена. Админка и LIVE-табло доступны.'
   offline='Офлайн-сервер работает. Судьи могут подключиться по Wi-Fi.'
   next='Этап загружен. Результаты предыдущего этапа сохранены в архиве.'
   directory='Профили и автомобили обновлены. Регистрации остались прежними.'
   export='Зашифрованная резервная копия сохранена. Сайт её ещё не получил.'
   online='Сайт подтвердил получение результатов.'
   certificate='Сертификат для судей сохранён в папке программы.'
  }
  $ui.Notice.Text=$messages[$request.Action]
  if($request.Action -eq 'next'){
   $next=@($lines|Where-Object {$_ -match '^USD VENUE WORKSPACE: '}|Select-Object -Last 1)
   if($next.Count){
    $path=$next[0].Substring('USD VENUE WORKSPACE: '.Length).Trim()
    $verified=@(Get-LocalWorkspaces|Where-Object {$_.Root -ceq $path -and $_.State.phase -eq 'READY'})
    if($verified.Count -eq 1){$script:Root=$verified[0].Root}
   }
  }
  if($request.Action -in @('export','certificate')){
   $folder=if($request.Action -eq 'export'){Join-Path $request.Root 'local-private/return-output'}else{$request.Root}
   try{Start-Process -FilePath explorer.exe -ArgumentList ('"'+$folder+'"')}catch{}
  }
 }else{
  $reasons=@($lines|Where-Object {$_ -match '^USD VENUE ERROR: '})
  $reason=if($reasons.Count){$reasons[0].Substring('USD VENUE ERROR: '.Length)}else{($lines|Select-Object -Last 4) -join ' '}
  Show-UsdOperationFailure $request $reason (Format-UsdLog (@('Код завершения: '+$code)+$lines))
 }
 $script:NextProbe=[DateTime]::MinValue
 Update-UsdDashboard
}

function Update-UsdProbe {
 if($script:Probe){
  $job=$script:Probe
  $job.Process.Refresh()
  $line=@()
  $timedOut=([DateTime]::UtcNow-$job.Started).TotalSeconds -gt 30
  if(!$job.Process.HasExited -and !$timedOut){return}
  if(!$job.Process.HasExited){try{$job.Process.Kill()}catch{}}
  else{
   $line=@(Get-UsdLog $job | Where-Object {$_ -match '^USD STATUS: '} | Select-Object -Last 1)
   if(!$script:Worker -and $job.Root -ceq $script:Root -and $line.Count){
    $script:Local=$line[0].Substring(12)|ConvertFrom-Json
    if($script:Local.mode -eq 'archived'){
     $known=@(Get-LocalWorkspaces|Where-Object {$_.Id -ceq $script:Local.activeStageId})
     if($known.Count -eq 1){
      $script:Root=$known[0].Root
      $script:Local=$null
      $script:NextProbe=[DateTime]::MinValue
     }
    }
   }
  }
  if(($timedOut -or !$line.Count) -and !$script:Worker -and $job.Root -ceq $script:Root){
   $script:Local=[pscustomobject]@{mode='attention';reason='Не удалось проверить сервер. Откройте Docker Desktop и повторите.';running=$false;docker=$false}
  }
  $job.Process.Dispose()
  Remove-Item -LiteralPath $job.Output,$job.Errors -Force -ErrorAction SilentlyContinue
  $script:Probe=$null
  Update-UsdDashboard
 }
 if(!$script:Probe -and !$script:Worker -and [DateTime]::UtcNow -ge $script:NextProbe){
  $script:NextProbe=[DateTime]::UtcNow.AddSeconds(20)
  $script:Probe=Start-UsdChild 'status' $script:Root
 }
}

function Set-UsdAction([string]$Name,[bool]$Available,[string]$Reason){
 $button=$ui[$Name]
 $button.IsEnabled=$Available -and !$script:Worker
 $button.ToolTip=if($script:Worker){'Дождитесь завершения текущей операции.'}elseif(!$Available){$Reason}else{$null}
}
function Update-UsdDashboard {
 $stateProblem=''
 try{
  $script:State=Get-InstalledStage
  $script:Pending=Get-PendingStageBundle
 }catch{
  $stateProblem='Не удалось прочитать состояние этапа. Откройте диагностику.'
  $script:State=$null
  $script:Pending=$null
 }
 $state=$script:State
 $local=$script:Local
 $ready=$state -and $state.phase -eq 'READY' -and $state.Snapshot
 $running=$local -and $local.running
 $active=$ready -and (!$local -or $local.mode -ne 'archived')
 $pending=$script:Pending
 $mode=if($stateProblem){'attention'}
 elseif($script:Worker -and $script:Worker.Request.Action -eq 'online'){'sending'}
 elseif($script:Worker -and $script:Worker.Request.Action -in @('install','next','offline')){'preparing'}
 elseif($local){$local.mode}
 elseif($ready){''}
 elseif($state -or $pending){'preparing'}else{'empty'}
 $ui.Status.Text=if($mode -and $script:StatusLabels.ContainsKey($mode)){$script:StatusLabels[$mode]}else{'Проверяем состояние'}
 $ui.StageTitle.Text=if($state){Get-UsdStageName $state}elseif($pending -and $pending.Label){$pending.Label}else{'Текущий этап'}
 $ui.StageMeta.Text=if($state -and $state.Snapshot){Get-StageMeta $state.Snapshot.stage}elseif($pending){'Пакет скачан. Установку можно продолжить.'}else{''}
 $reg=Get-UsdProperty $local 'registrations'
 $people=Get-UsdProperty $local 'participants'
 if($state -and $state.Snapshot -and $null -eq $reg){
  $reg=$state.Snapshot.Registrations
  $people=$state.Snapshot.Participants
  $stats="В пакете: участников $people · регистраций $reg"
 }elseif($null -ne $reg){$stats="Участников $people · регистраций $reg"}else{$stats=''}
 $sync=Format-UsdDate (Get-UsdProperty $local 'syncedAt') 'dd.MM.yyyy, HH:mm'
 if($state){
  $syncText=if($sync){'Последняя синхронизация '+$sync}elseif($local -and $local.docker){'Подтверждение синхронизации пока недоступно'}else{'Синхронизация ещё не проверена'}
  $stats=(@($stats,$syncText)|Where-Object {$_}) -join '  ·  '
 }
 $ui.StageStats.Text=$stats
 $reason=if($stateProblem){$stateProblem}elseif($mode -eq 'attention'){[string]$local.reason}elseif($state -and !$state.Snapshot){'Пакет этапа недоступен. Проверьте рабочую папку USD.'}else{''}
 $ui.StatusReason.Text=$reason
 $ui.StatusReason.Visibility=if($reason){'Visible'}else{'Collapsed'}
 $allLocal=@(Get-LocalWorkspaces)
 $script:Archive=@($allLocal|Where-Object {$state -and $_.Id -cne $state.stageId -and $_.State.phase -eq 'READY'})
 $exclude=@($allLocal|Where-Object {$_.State.phase -eq 'READY'}|ForEach-Object {$_.Id})
 $exclude+=@(Get-UsdProperty $local 'stageIds')
 $selected=if($ui.Stages.SelectedItem){$ui.Stages.SelectedItem.Tag.Id}else{''}
 $items=@(foreach($stage in ($script:Stages|Sort-Object date)){
  if($stage.status -eq 'PUBLISHED' -and $stage.id -cmatch $script:StagePattern -and $exclude -notcontains $stage.id -and (!$state -or $stage.id -cne $state.stageId)){
   [pscustomobject]@{Id=[string]$stage.id;Label=($stage.name+'  ·  '+(Get-StageMeta $stage))}
  }
 })
 $current=@($ui.Stages.Items|ForEach-Object {$_.Tag.Id})
 if(($current -join '|') -cne (($items|ForEach-Object {$_.Id}) -join '|')){
  $ui.Stages.Items.Clear()
  foreach($choice in $items){Add-UsdChoice $ui.Stages $choice}
  $match=@($ui.Stages.Items|Where-Object {$_.Tag.Id -ceq $selected})
  if($match.Count){$ui.Stages.SelectedItem=$match[0]}
 }
 $ui.Stages.IsEnabled=($items.Count -gt 0) -and !$script:Worker -and !$pending -and (!$state -or $active)
 $ui.StageHint.Text=if($pending){'Есть незавершённая загрузка. Продолжите установку сохранённого этапа.'}
 elseif($state -and !$ready){'Завершите подготовку текущего этапа.'}
 elseif(!$script:Token){'Войдите в USD, чтобы увидеть доступные этапы.'}
 elseif(!$items.Count){'Новых опубликованных этапов для загрузки нет.'}
 else{'Установленный этап и локальная история исключены из списка.'}
 $busy=$null -ne $script:Worker
 $ui.Progress.Visibility=if($busy){'Visible'}else{'Collapsed'}
 $ui.Progress.IsIndeterminate=$busy
 $ui.Account.Content=if($script:Token){'Выйти из USD'}else{'Войти в USD'}
 $ui.Load.Content=if($pending){'Продолжить загрузку'}else{'Загрузить этап'}
 $ui.Install.Content=if($state -and !$ready){'Продолжить установку'}else{'Установить или обновить сервер'}
 $ip=[string](Get-UsdProperty $state 'ip')
 $address=if($ip -match '^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)(?:\d{1,3}\.)?\d{1,3}\.\d{1,3}$'){'https://'+$ip}else{''}
 $ui.Address.Text=if($address){$address}else{'Адрес появится после подготовки сервера'}
 $workingReason='Сначала запустите офлайн-сервер и дождитесь проверки HTTPS.'
 $setupReason='Сначала загрузите и установите этап.'
 $historical=$local -and $local.mode -eq 'archived'
 Set-UsdAction 'Account' $true ''
 Set-UsdAction 'Load' ([bool](!$stateProblem -and !$historical -and ($pending -or ($ui.Stages.IsEnabled -and $ui.Stages.SelectedItem)))) 'Войдите в USD и выберите доступный этап.'
 Set-UsdAction 'Install' ([bool](!$stateProblem -and !$historical -and ($pending -or $state -or ($ui.Stages.IsEnabled -and $ui.Stages.SelectedItem)))) $setupReason
 Set-UsdAction 'Directory' ([bool]($active -and $script:Token)) $(if($active){'Войдите в USD, чтобы скачать свежий справочник.'}else{$setupReason})
 Set-UsdAction 'Start' ([bool]$active) $setupReason
 foreach($name in 'Admin','Live','Certificate','Copy'){Set-UsdAction $name ([bool]($active -and $running -and $address)) $workingReason}
 Set-UsdAction 'Backup' ([bool]$ready) $setupReason
 Set-UsdAction 'Send' ([bool]($ready -and !(Get-UsdProperty $local 'expiredSync'))) $(if($ready){'Ключ отправки этапа просрочен. Сохраните резервную копию.'}else{$setupReason})
 Set-UsdAction 'Archive' ($script:Archive.Count -gt 0) 'Здесь появятся предыдущие этапы, установленные на этом ноутбуке.'
}

function Invoke-UsdLoad {
 $pending=$script:Pending
 if($pending){
  $request=New-UsdRequest $pending.Action 'продолжить загрузку этапа' $script:Root $pending.Id
  if($pending.Expires -gt [DateTimeOffset]::UtcNow){$request.Bundle=$pending}
  elseif(!$script:Token){
   $ui.Notice.Text='Срок сохранённого пакета истёк. Войдите в USD, затем нажмите «Продолжить загрузку».'
   return
  }
  Start-UsdRequest $request
  return
 }
 if(!$ui.Stages.SelectedItem){return}
 $choice=$ui.Stages.SelectedItem.Tag
 if($script:State -and !(Confirm-UsdAction 'Загрузить другой этап' ('Текущий этап «'+(Get-UsdStageName $script:State)+'» будет закрыт для судейского ввода. Программа сохранит его зашифрованную копию и откроет «'+$choice.Label+'». Продолжить?'))){return}
 $action=if($script:State){'next'}else{'install'}
 Start-UsdRequest (New-UsdRequest $action 'загрузить этап' $script:Root $choice.Id)
}
function Show-UsdArchive {
 $dialog=New-UsdDialog 'Архив этапов'
 $window=$dialog.Window
 $panel=$dialog.Panel
 $null=Add-UsdText $panel 'Предыдущие этапы на этом ноутбуке' 19
 $list=[Windows.Controls.ListBox]::new()
 foreach($item in $script:Archive){Add-UsdChoice $list $item}
 $list.MinHeight=120
 $list.MaxHeight=240
 $list.SelectedIndex=0
 [void]$panel.Children.Add($list)
 $null=Add-UsdText $panel 'Выберите этап. Можно открыть его копии, создать новую копию или отправить его результаты.'
 $actions=[Windows.Controls.WrapPanel]::new()
 [void]$panel.Children.Add($actions)
 foreach($pair in @(@('Открыть папку копий','folder'),@('Сохранить копию','export'),@('Отправить на сайт','online'))){
  $button=New-UsdButton $pair[0]
  $button.Tag=$pair[1]
  $button.Add_Click({
   if($list.SelectedItem){$window.Tag=[pscustomobject]@{Action=[string]$this.Tag;Item=$list.SelectedItem.Tag};$window.DialogResult=$true}
  }.GetNewClosure())
  [void]$actions.Children.Add($button)
 }
 if(!$window.ShowDialog()){return}
 $choice=$window.Tag
 if($choice.Action -eq 'folder'){
  $path=Join-Path $choice.Item.Root 'local-private/return-output'
  if(Test-Path -LiteralPath $path -PathType Container){Start-Process explorer.exe -ArgumentList ('"'+$path+'"')}
  else{$null=Show-UsdDialog 'Папка копий' 'Для этого этапа пока нет сохранённых файлов.'}
  return
 }
 if($choice.Action -eq 'online' -and !(Confirm-UsdAction 'Отправить архивные результаты' ('Сайт USD получит результаты этапа «'+$choice.Item.Label+'». Продолжить?'))){return}
 $label=if($choice.Action -eq 'export'){'сохранить архивную копию'}else{'отправить архивные результаты'}
 Start-UsdRequest (New-UsdRequest $choice.Action $label $choice.Item.Root)
}
function Show-UsdDiagnostics {
 $entries=@('Рабочая папка: '+$script:Root,'Windows PowerShell: '+$PSVersionTable.PSVersion)
 if($script:DashboardError){$entries+=$script:DashboardError}
 if($script:Local){
  $entries+=@('Docker отвечает: '+$script:Local.docker,'Локальный HTTPS отвечает: '+$script:Local.running)
  if($ui.StatusReason.Text){$entries+=$ui.StatusReason.Text}
 }
 $null=Show-UsdDialog 'Диагностика' $ui.Status.Text 'Для новой проверки закройте окно. USD проверяет сервер каждые 20 секунд.' ($entries -join [Environment]::NewLine)
 $script:NextProbe=[DateTime]::MinValue
}
function Show-UsdJournal {
 $path=Join-Path $script:Root 'local-private/operations'
 $files=if(Test-Path -LiteralPath $path -PathType Container){@(Get-ChildItem -LiteralPath $path -Filter '*.log' -File|Where-Object {$_.Name -notlike '*.err.log'}|Sort-Object LastWriteTime -Descending|Select-Object -First 8)}else{@()}
 $lines=@(foreach($file in $files){
  $file.LastWriteTime.ToString('dd.MM.yyyy HH:mm:ss')+'  '+$file.BaseName
  Get-Content -LiteralPath $file.FullName -Encoding UTF8 -Tail 12
  $err=Join-Path $file.DirectoryName ($file.BaseName+'.err.log')
  if(Test-Path -LiteralPath $err -PathType Leaf){Get-Content -LiteralPath $err -Encoding UTF8 -Tail 12}
  ''
 })
 $msg=if($lines.Count){'Последние действия в этой установке.'}else{'Операций пока нет.'}
 $null=Show-UsdDialog 'Журнал операций' $msg '' (Format-UsdLog $lines)
}

# Tests and the in-process network worker load the functions without creating windows.
if($MyInvocation.InvocationName -eq '.'){return}
$script:Form=New-UsdWindow
$ui=@{}
foreach($name in 'Account','Body','Notice','Progress','Status','StageTitle','StageMeta','StageStats','StatusReason','Stages','Load','StageHint','Install','Directory','Start','Admin','Live','Certificate','Address','Copy','Backup','Send','Archive','Help','Diagnostics','Journal'){
 $ui[$name]=$script:Form.FindName($name)
}
$script:NextProbe=[DateTime]::MinValue
$ui.Stages.Add_SelectionChanged({
 # Selection can change while ItemsSource is being replaced by Update-UsdDashboard.
 $available=$null -ne $ui.Stages.SelectedItem -and $ui.Stages.IsEnabled -and !$script:Worker
 if(!$script:Pending){Set-UsdAction 'Load' $available 'Выберите этап из списка.'}
 if(!$script:Pending -and !$script:State){Set-UsdAction 'Install' $available 'Выберите этап из списка.'}
})
$ui.Account.Add_Click({
 if($script:Token){
  $script:Token=''
  $script:Stages=@()
  $ui.Notice.Text='Вы вышли из онлайн-USD.'
  Update-UsdDashboard
 }else{Start-UsdRequest (New-UsdRequest 'login' 'войти в USD')}
})
$ui.Load.Add_Click({Invoke-UsdLoad})
$ui.Install.Add_Click({
 if($script:Pending -or !$script:State){Invoke-UsdLoad;return}
 Start-UsdRequest (New-UsdRequest 'install' 'установить или обновить сервер' $script:Root $(if($script:State.phase -ne 'READY' -and $script:Token){$script:State.stageId}else{''}))
})
$ui.Directory.Add_Click({Start-UsdRequest (New-UsdRequest 'directory' 'обновить участников и автомобили' $script:Root $script:State.stageId)})
$ui.Start.Add_Click({Start-UsdRequest (New-UsdRequest 'offline' 'запустить офлайн-сервер')})
$ui.Admin.Add_Click({Start-Process ($ui.Address.Text+'/admin/event-day?next=%2Fadmin%2Fevent-day')})
$ui.Live.Add_Click({Start-Process ($ui.Address.Text.Replace('https:','http:')+'/venue/live')})
$ui.Copy.Add_Click({
 try{[Windows.Clipboard]::SetText($ui.Address.Text);$ui.Notice.Text='Адрес скопирован.'}
 catch{$null=Show-UsdDialog 'Адрес локального сервера' $ui.Address.Text}
})
$ui.Certificate.Add_Click({Start-UsdRequest (New-UsdRequest 'certificate' 'получить сертификат')})
$ui.Backup.Add_Click({Start-UsdRequest (New-UsdRequest 'export' 'сохранить резервную копию')})
$ui.Send.Add_Click({
 if(Confirm-UsdAction 'Отправить результаты' 'Программа сохранит зашифрованную копию и дождётся подтверждения от сайта USD. На время отправки судейский ввод приостановится. Продолжить?'){
  Start-UsdRequest (New-UsdRequest 'online' 'отправить результаты на сайт')
 }
})
$ui.Archive.Add_Click({Show-UsdArchive})
$ui.Help.Add_Click({Start-Process (Join-Path $script:Root 'INSTRUCTION.html')})
$ui.Diagnostics.Add_Click({Show-UsdDiagnostics})
$ui.Journal.Add_Click({Show-UsdJournal})
$timer=[Windows.Threading.DispatcherTimer]::new()
$timer.Interval=[TimeSpan]::FromMilliseconds(700)
$timer.Add_Tick({
 try{
  Complete-UsdWorker
  Update-UsdProbe
 }catch{
  $script:DashboardError=$_.Exception.Message
  $ui.Notice.Text='Не удалось обновить состояние. Откройте диагностику или журнал операций.'
 }
})
$script:Form.Add_Closing({
 if($script:Worker){
  $_.Cancel=$true
  $ui.Notice.Text='Дождитесь окончания операции. Окно можно свернуть.'
 }
})
try{
 Update-UsdDashboard
 $timer.Start()
 [void]$script:Form.ShowDialog()
}finally{
 $timer.Stop()
 if($script:Probe){
  try{if(!$script:Probe.Process.HasExited){$script:Probe.Process.Kill()}}catch{}
  $script:Probe.Process.Dispose()
  Remove-Item -LiteralPath $script:Probe.Output,$script:Probe.Errors -Force -ErrorAction SilentlyContinue
 }
 $script:Token=''
}
