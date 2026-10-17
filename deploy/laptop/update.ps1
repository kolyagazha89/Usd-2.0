[CmdletBinding()]
param(
  [string]$ComposeFile = (Join-Path $PSScriptRoot "docker-compose.yml"),
  [string]$EnvFile = (Join-Path $PSScriptRoot ".env"),
  [int]$HealthTimeoutSeconds = 180
)

$ErrorActionPreference = "Stop"
$Repo = "kolyagazha89/Usd-2.0"
$ComposeDir = $PSScriptRoot

function Invoke-Compose([string[]]$ComposeArgs) {
  & docker compose --project-directory $ComposeDir --env-file $EnvFile -f $ComposeFile @ComposeArgs
  if ($LASTEXITCODE -ne 0) { throw "docker compose failed: $($ComposeArgs -join ' ')" }
}

function Get-EnvValue([string]$Name) {
  $line = Get-Content -LiteralPath $EnvFile | Where-Object { $_ -match "^$([regex]::Escape($Name))=" } | Select-Object -First 1
  if (-not $line) { return $null }
  return $line.Substring($Name.Length + 1).Trim()
}

function Set-EnvValue([string]$Name, [string]$Value) {
  $lines = @(Get-Content -LiteralPath $EnvFile)
  $pattern = "^$([regex]::Escape($Name))="
  $found = $false
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match $pattern) {
      $lines[$i] = "$Name=$Value"
      $found = $true
    }
  }
  if (-not $found) { $lines += "$Name=$Value" }
  Set-Content -LiteralPath $EnvFile -Value $lines -Encoding utf8
}

function Wait-ForHealth {
  $deadline = (Get-Date).AddSeconds($HealthTimeoutSeconds)
  do {
    Start-Sleep -Seconds 5
    try {
      $api = Invoke-WebRequest -Uri "http://127.0.0.1:3000/" -TimeoutSec 5 -UseBasicParsing
      $web = Invoke-WebRequest -Uri "http://127.0.0.1:8080/" -TimeoutSec 5 -UseBasicParsing
      if ($api.StatusCode -ge 200 -and $api.StatusCode -lt 300 -and $web.StatusCode -ge 200 -and $web.StatusCode -lt 300) {
        $status = (& docker compose --project-directory $ComposeDir --env-file $EnvFile -f $ComposeFile ps --format json | ConvertFrom-Json)
        $unhealthy = @($status | Where-Object { $_.Service -in @("api", "frontend", "db") -and $_.Health -eq "unhealthy" })
        if ($unhealthy.Count -eq 0) { return $true }
      }
    } catch { }
  } while ((Get-Date) -lt $deadline)
  return $false
}

if (-not (Test-Path -LiteralPath $EnvFile)) {
  throw "Missing .env. Copy .env.example to .env and configure it first."
}

$previousTag = Get-EnvValue "USD_IMAGE_TAG"
if (-not $previousTag) { throw "USD_IMAGE_TAG is missing from .env" }

$headers = @{ "Accept" = "application/vnd.github+json"; "User-Agent" = "USD-Laptop-Updater" }
$commit = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/commits/main" -Headers $headers -TimeoutSec 20
$newTag = "sha-$($commit.sha)"

if ($previousTag -eq $newTag) {
  Write-Host "USD is already configured for main commit $($commit.sha). Checking containers."
  Invoke-Compose @("ps")
  exit 0
}

Write-Host "Preparing USD update to $newTag. Previous tag: $previousTag"
# Pull exact commit tags first. This does not stop or recreate running containers.
& docker pull "ghcr.io/kolyagazha89/usd-2.0-api:$newTag"
if ($LASTEXITCODE -ne 0) { throw "Could not pull API image $newTag. Current deployment was not changed." }
& docker pull "ghcr.io/kolyagazha89/usd-2.0-frontend:$newTag"
if ($LASTEXITCODE -ne 0) { throw "Could not pull frontend image $newTag. Current deployment was not changed." }

Set-EnvValue "USD_IMAGE_TAG" $newTag
try {
  Invoke-Compose @("up", "-d", "--no-build", "--pull", "never")
  if (Wait-ForHealth) {
    Write-Host "USD update succeeded: $newTag"
    exit 0
  }
  throw "Health checks did not pass within $HealthTimeoutSeconds seconds."
} catch {
  $updateError = $_
  Write-Warning "Update failed. Rolling back to $previousTag"
  Set-EnvValue "USD_IMAGE_TAG" $previousTag
  try {
    Invoke-Compose @("up", "-d", "--no-build", "--pull", "never")
    if (Wait-ForHealth) {
      Write-Warning "Rollback succeeded. USD is running with $previousTag"
    } else {
      Write-Error "Rollback was attempted but health checks are still failing. Inspect Docker logs immediately."
    }
  } catch {
    Write-Error "Rollback command failed: $_"
  }
  throw $updateError
}
