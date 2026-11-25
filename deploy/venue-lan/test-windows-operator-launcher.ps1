#requires -Version 5.1
# Launch the distributed CMD as a user would, including first dashboard refresh.
$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
Add-Type -AssemblyName System.IO.Compression.FileSystem

function New-UiCondition($Property,$Value){
 return [Windows.Automation.PropertyCondition]::new($Property,$Value)
}

function Assert-UsdLauncher([string]$Kit,[string]$ExpectedText){
 $startup=[Diagnostics.ProcessStartInfo]::new()
 $startup.FileName=$env:ComSpec
 $startup.Arguments='/d /c USD-Control.cmd'
 $startup.WorkingDirectory=$Kit
 $startup.UseShellExecute=$false
 $startup.CreateNoWindow=$true
 $startup.RedirectStandardOutput=$true
 $startup.RedirectStandardError=$true
 $launcher=[Diagnostics.Process]::Start($startup)
 $stdout=$launcher.StandardOutput.ReadToEndAsync()
 $stderr=$launcher.StandardError.ReadToEndAsync()
 $window=$null
 try{
  $title=New-UiCondition ([Windows.Automation.AutomationElement]::NameProperty) 'USD — Офлайн-сервер'
  $heading=New-UiCondition ([Windows.Automation.AutomationElement]::NameProperty) $ExpectedText
  $deadline=[DateTime]::UtcNow.AddSeconds(30)
  do{
   if($launcher.HasExited){break}
   $candidate=[Windows.Automation.AutomationElement]::RootElement.FindFirst(
    [Windows.Automation.TreeScope]::Children,$title)
   if($candidate -and $candidate.FindFirst([Windows.Automation.TreeScope]::Descendants,$heading)){
    $window=$candidate
    break
   }
   Start-Sleep -Milliseconds 250
  }while([DateTime]::UtcNow -lt $deadline)
  if(!$window){throw "USD-Control.cmd did not display '$ExpectedText'."}
  $window.GetCurrentPattern([Windows.Automation.WindowPattern]::Pattern).Close()
  if(!$launcher.WaitForExit(10000)){throw 'USD-Control.cmd did not exit after closing the dashboard.'}
  if($launcher.ExitCode -ne 0){throw "USD-Control.cmd returned $($launcher.ExitCode)."}
 }catch{
  if(!$launcher.HasExited){& taskkill.exe /PID $launcher.Id /T /F 2>&1 | Out-Null}
  if($launcher.WaitForExit(5000)){
   Write-Host $stdout.GetAwaiter().GetResult()
   Write-Host $stderr.GetAwaiter().GetResult()
  }
  throw
 }finally{$launcher.Dispose()}
}

$temp=Join-Path ([IO.Path]::GetTempPath()) ('USD Windows startup '+[guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($temp)
try{
 $bundle=Join-Path $PSScriptRoot '../../frontend/public/downloads/USD-Offline-Windows.zip'
 [IO.Compression.ZipFile]::ExtractToDirectory((Resolve-Path -LiteralPath $bundle).Path,$temp)
 $kit=Join-Path $temp 'USD-Offline-Windows'
 Assert-UsdLauncher $kit 'Текущий этап'

 $private=Join-Path $kit 'local-private'
 [void][IO.Directory]::CreateDirectory($private)
 $package=Join-Path $private 'stage.json'
 $stageId='c510f672-79f7-44eb-8173-2a8ff94b1c0e'
 $fingerprint='a'*64
 $stageName='Локальный тестовый этап USD'
 $snapshot=@{
  stageId=$stageId
  stage=@{name=$stageName;city='Тюмень';date='2026-12-01';season=@{name='Сезон 2026'}}
 }
 $stage=@{snapshot=$snapshot;integrity=@{publicKeyFingerprint=$fingerprint}}
 $state=@{phase='READY';stageId=$stageId;fingerprint=$fingerprint;package=$package;home=$kit;ip='192.168.20.10'}
 $stage|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $package -Encoding UTF8
 $state|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $private 'setup-state.json') -Encoding UTF8
 Assert-UsdLauncher $kit $stageName
 Write-Host 'USD CMD LAUNCH PASS: packaged app starts with an empty install and a retained stage.'
}finally{Remove-Item -LiteralPath $temp -Recurse -Force}
