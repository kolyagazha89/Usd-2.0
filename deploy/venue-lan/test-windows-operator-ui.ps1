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

# Interactive workers must not inherit SW_HIDE for their first native dialog.
foreach($action in @('install','next','prepare','offline','online','export','directory','certificate')){
 if((Get-UsdWorkerWindowStyle $action) -ne 'Normal'){throw "Interactive worker $action must be visible"}
}
foreach($action in @('status','images')){
 if((Get-UsdWorkerWindowStyle $action) -ne 'Hidden'){throw "Background worker $action must remain hidden"}
}

$originalRoot=$script:Root
$temp=Join-Path ([IO.Path]::GetTempPath()) ('usd-operator-test-'+[guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($temp)
try{
 $script:Root=$temp
 $credentials=[pscustomobject]@{Email='operator@example.test';Password='test-only'}
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
  if($Path -eq ('/stages/venue/'+$stage+'/staff-export')){return $script:FixtureJson}
  throw 'Unexpected online request'
 }
 $fresh=[DateTime]::UtcNow.AddHours(5).ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
 $raw=$raw.Replace('2099-01-01T00:00:00.000Z',$fresh)
 $script:FixtureJson=$raw
 $login=Connect-UsdAdmin $credentials
 if($credentials.Password -or $login.Stages.Count -ne 1){throw 'Login did not clear password or load stages'}
 $download=Get-OnlineStageBundle $stage $login.Token
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
 $rejected=$false
 try{Connect-UsdAdmin $credentials|Out-Null}
 catch{if($_.Exception.Message -notmatch 'ADMIN'){throw};$rejected=$true}
 if(!$rejected){throw 'Non-ADMIN downloaded a stage'}
 $containerLine='Container usd-venue-5b0db23352114a83848cf104fc5052cd-api-1 Stopping'
 $secret='s'*43
 $details=Format-UsdLog @($containerLine,('Authorization: Venue '+$secret),'System.Management.Automation.RemoteException')
 if(!$details.Contains($containerLine) -or $details.Contains($secret) -or $details.Contains('RemoteException')){
  throw 'Operator diagnostics masked container names, leaked a token or retained error noise'
 }
 [IO.File]::WriteAllText((Join-Path $temp 'venue-control.ps1'),"Write-Output 'USD VENUE IMPORT REFUSED: CONFIGURATION_VERSION_CONFLICT'; exit 17")
 $testJob=Start-UsdChild 'next' $temp
 try{
  if(!$testJob.Process.WaitForExit(10000) -or $testJob.Process.ExitCode -ne 17){
   throw 'Windows stage worker must retain its nonzero exit code'
  }
  if((Get-UsdLog $testJob) -notcontains 'USD VENUE IMPORT REFUSED: CONFIGURATION_VERSION_CONFLICT'){
   throw 'Windows stage worker lost the specific import reason'
  }
 }finally{$testJob.Process.Dispose()}
 # Startup checks once, after Docker is ready, with no token or stage download.
 $script:StartupImagesAttempted=$false
 $script:State=[pscustomobject]@{phase='READY';stageId=$stage}
 $script:Local=[pscustomobject]@{docker=$false;mode='ready'}
 $script:Pending=$null;$script:Worker=$null
 if(Get-UsdStartupImageRequest){throw 'Startup must not launch Docker automatically'}
 $script:Local.docker=$true;$script:Local.mode='archived'
 if(Get-UsdStartupImageRequest){throw 'Startup must not update archived stage'}
 $script:Local.mode='working'
 $request=Get-UsdStartupImageRequest
 if(!$request -or $request.Action -cne 'images' -or $request.Id -or $request.Root -cne $temp){
  throw 'Startup cache must use local worker, not authenticated package download'
 }
 if(Get-UsdStartupImageRequest){throw 'Startup must not retry on every status tick'}
 # A malformed status response or a killed probe must not pin the dashboard in checking.
 function Update-UsdDashboard {}
 $ui=@{Notice=[pscustomobject]@{Text='Проверяем локальный сервер…'}}
 $script:NextProbe=[DateTime]::UtcNow.AddMinutes(1)
 $script:Local=$null
 [IO.File]::WriteAllText((Join-Path $temp 'venue-control.ps1'),"Write-Output 'USD STATUS: {bad-json'; exit 0")
 $script:Probe=Start-UsdChild 'status' $temp
 if(!$script:Probe.Process.WaitForExit(10000)){throw 'Status fixture did not exit'}
 Update-UsdProbe
 if($script:Probe -or $script:Local.mode -cne 'attention' -or !$script:Local.reason){
  throw 'Malformed status must release the probe and display an actionable failure'
 }
 if($ui.Notice.Text -notmatch 'Не удалось проверить'){throw 'Initial status notice must report failed probes'}
 # A second, valid probe must recover without reopening the application.
 [IO.File]::WriteAllText((Join-Path $temp 'venue-control.ps1'),"Write-Output 'USD STATUS: {""mode"":""ready"",""docker"":true,""running"":false}'; exit 0")
 $script:Probe=Start-UsdChild 'status' $temp
 if(!$script:Probe.Process.WaitForExit(10000)){throw 'Recovery fixture did not exit'}
 Update-UsdProbe
 if($script:Probe -or $script:Local.mode -cne 'ready'){throw 'Status recovery failed'}
 if($ui.Notice.Text -cne 'Локальный сервер проверен.'){throw 'Successful probe must replace the checking notice'}
 # Image download is separate from the exclusive operator worker and the status probe.
 $script:StartupImagesAttempted=$false
 $script:State=[pscustomobject]@{phase='READY';stageId=$stage}
 $script:Pending=$null
 $script:ImageJob=$null
 $script:Worker=$null
 $script:LaunchRoot=$temp
 [IO.File]::WriteAllText((Join-Path $temp 'venue-control.ps1'),"Start-Sleep -Seconds 2; Write-Output 'USD STARTUP IMAGES: cached'")
 $ui=@{Notice=[pscustomobject]@{Text=''}}
 Update-UsdStartupImages
 if(!$script:ImageJob -or $script:Worker -or $script:Probe){throw 'Passive image download must not lock the operator or status check'}
 if(!$script:ImageJob.Process.WaitForExit(10000)){throw 'Image fixture did not exit'}
 Update-UsdStartupImages
 if($script:ImageJob -or $script:Worker -or $ui.Notice.Text -notmatch 'скачаны'){throw 'Image result was not reported independently'}
 $script:LaunchRoot=$originalRoot
 $script:State=$null;$script:Local=$null
 Write-Host 'USD OPERATOR: signed JSON, ADMIN guard, startup image gate and protected files passed'
}finally{
 $script:Root=$originalRoot
 Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
}

# Render the actual WPF content at notebook widths in device-independent pixels.
# Capture a bitmap at each corresponding 100/125/150% DPI.
$visuals=Join-Path (Get-Location) 'venue-windows-render'
[void][IO.Directory]::CreateDirectory($visuals)
foreach($scale in 1.0,1.25,1.5){
 $window=New-UsdWindow
 $dpi=96*$scale
 $width=[Math]::Floor(1280/$scale)
 $height=[Math]::Floor(750/$scale)
 $root=$window.FindName('Dashboard')
 $title=$window.FindName('StageTitle')
 $title.Text='Финал чемпионата USD по автозвуку'
 $window.FindName('StageMeta').Text='Белая Калитва  ·  28.11.2026  ·  Сезон 2026'
 $window.FindName('StageStats').Text='Участников 1200 · регистраций 139  ·  Последняя синхронизация 28.11.2026, 19:35'
 $window.FindName('Status').Text='Офлайн-сервер работает'
 $list=$window.FindName('Stages')
 $option=[pscustomobject]@{Id=$stage;Label='Первый этап  ·  Ростов-на-Дону  ·  06.12.2026'}
 Add-UsdChoice $list $option
 $list.SelectedIndex=0
 $window.FindName('StageHint').Text='Выберите опубликованный этап.'
 $window.FindName('Address').Text='https://192.168.20.10'
 $window.FindName('Notice').Text='Сервер проверен. Судьи могут подключиться по Wi-Fi.'
 $window.Width=$width
 $window.Height=$height
 $window.Show()
 try{
  $window.UpdateLayout()
  $selection=$list.Template.FindName('SelectedStageLabel',$list)
  if($selection.Text -cne $option.Label -or $selection.Text -match $stage){
   throw 'Stage selector must show the label without exposing the internal stage ID'
  }
  $size=$root.RenderSize
  $scroller=$window.FindName('Body')
  if($size.Width -lt 540 -or $size.Height -lt 370){throw 'Dashboard could not lay out at a notebook viewport'}
  if($scroller.ScrollableWidth -gt 1){throw 'Dashboard has horizontal overflow'}
  foreach($name in 'StageTitle','Stages','Load','Start','Admin','Live','Backup','Send','Archive','Diagnostics'){
   $element=$window.FindName($name)
   if($element.ActualWidth -lt 35 -or $element.ActualHeight -lt 24){throw ('Control did not render: '+$name)}
   $area=$element.TransformToAncestor($root).TransformBounds([Windows.Rect]::new($element.RenderSize))
   if($area.Left -lt 0 -or $area.Right -gt ($size.Width+1)){throw ('Control clips at '+$dpi+' DPI: '+$name)}
  }
  if($scale -eq 1.5 -and $scroller.ScrollableHeight -le 0){throw 'Small window must expose the remaining cards by scrolling'}
  $bitmap=[Windows.Media.Imaging.RenderTargetBitmap]::new(
   [int][Math]::Ceiling($size.Width*$scale),[int][Math]::Ceiling($size.Height*$scale),
   $dpi,$dpi,[Windows.Media.PixelFormats]::Pbgra32)
  $bitmap.Render($root)
  $png=[Windows.Media.Imaging.PngBitmapEncoder]::new()
  $png.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($bitmap))
  $stream=[IO.File]::Create((Join-Path $visuals ('dashboard-'+[int]($scale*100)+'.png')))
  try{$png.Save($stream)}finally{$stream.Dispose()}
  if($scale -eq 1.5){
   $scroller.ScrollToBottom()
   $window.UpdateLayout()
   $bottom=[Windows.Media.Imaging.RenderTargetBitmap]::new(
    [int][Math]::Ceiling($size.Width*$scale),[int][Math]::Ceiling($size.Height*$scale),
    $dpi,$dpi,[Windows.Media.PixelFormats]::Pbgra32)
   $bottom.Render($root)
   $encoder=[Windows.Media.Imaging.PngBitmapEncoder]::new()
   $encoder.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($bottom))
   $bottomFile=[IO.File]::Create((Join-Path $visuals 'dashboard-150-bottom.png'))
   try{$encoder.Save($bottomFile)}finally{$bottomFile.Dispose()}
  }
 }finally{$window.Close()}
}
Write-Host 'USD OPERATOR: WPF dashboard rendered at notebook viewports for 100%, 125%, 150%'
