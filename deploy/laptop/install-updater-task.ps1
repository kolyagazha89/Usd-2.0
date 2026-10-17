$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $PSScriptRoot "update.ps1"
if (-not (Test-Path -LiteralPath $scriptPath)) { throw "Updater script not found: $scriptPath" }

$taskName = "USD Laptop Auto Update"
$powerShell = (Get-Command powershell.exe -ErrorAction Stop).Source
$action = New-ScheduledTaskAction -Execute $powerShell -Argument ('-NoProfile -ExecutionPolicy Bypass -File "' + $scriptPath + '"') -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "Checks tested USD GHCR images and updates the local Docker Compose deployment with a smoke-check rollback." -Force | Out-Null
Write-Host ("Scheduled task '{0}' installed. It runs every 5 minutes while this Windows user is logged in." -f $taskName)
Write-Host ("To inspect: Get-ScheduledTask -TaskName '{0}'" -f $taskName)
Write-Host ("To remove: Unregister-ScheduledTask -TaskName '{0}' -Confirm:$false" -f $taskName) + "`n"