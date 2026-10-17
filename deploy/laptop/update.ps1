[CmdletBinding()]
param(
  [string]$ComposeFile = (Join-Path $PSScriptRoot "docker-compose.yml"),
  [string]$EnvFile = (Join-Path $PSScriptRoot ".env"),
  [int]$HealthTimeoutSeconds = 180
)

$ErrorActionPreference = "Stop"
$Repo = "kolyagazha89/Usd-2.0"
$ComposeDir = $PSScriptRoot
$LogDir = Join-Path $PSScriptRoot "logs"
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
Get-ChildItem -LiteralPath $LogDir -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-14) } | Remove-Item -Force -ErrorAction SilentlyContinue
Start-Transcript -Path (Join-Path $LogDir ("update-{0}.log" -f (Get-Date -Format "yyyyMMdd"))) -Append | Out-Null

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
  $content = ($lines -join "`r`n") + "`r`n"
  [System.IO.File]::WriteAllText($EnvFile, $content, [System.Text.UTF8Encoding]::new($false))
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

# Fail closed if local secrets were not replaced or the database URL password differs.
$postgresUser = Get-EnvValue "POSTGRES_USER"
$postgresDb = Get-EnvValue "POSTGRES_DB"
$postgresPassword = Get-EnvValue "POSTGRES_PASSWORD"
$databaseUrl = Get-EnvValue "DATABASE_URL"
$jwtSecret = Get-EnvValue "JWT_SECRET"
$s3AccessKey = Get-EnvValue "S3_ACCESS_KEY_ID"
$s3Secret = Get-EnvValue "S3_SECRET_ACCESS_KEY"
$s3Bucket = Get-EnvValue "S3_BUCKET"
foreach ($entry in @(
  @{ Name = "POSTGRES_USER"; Value = $postgresUser },
  @{ Name = "POSTGRES_DB"; Value = $postgresDb },
  @{ Name = "POSTGRES_PASSWORD"; Value = $postgresPassword },
  @{ Name = "DATABASE_URL"; Value = $databaseUrl },
  @{ Name = "JWT_SECRET"; Value = $jwtSecret },
  @{ Name = "S3_ACCESS_KEY_ID"; Value = $s3AccessKey },
  @{ Name = "S3_SECRET_ACCESS_KEY"; Value = $s3Secret },
  @{ Name = "S3_BUCKET"; Value = $s3Bucket }
)) {
  if ([string]::IsNullOrWhiteSpace($entry.Value) -or $entry.Value -match "REPLACE_WITH") {
    throw "$($entry.Name) is missing or still contains a placeholder. Configure deploy/laptop/.env first."
  }
}
if ($postgresPassword.Length -lt 32) { throw "POSTGRES_PASSWORD must be at least 32 characters." }
if ($jwtSecret.Length -lt 64) { throw "JWT_SECRET must be at least 64 characters." }
if ($s3Secret.Length -lt 32) { throw "S3_SECRET_ACCESS_KEY must be at least 32 characters." }
$expectedDbSegment = "://" + $postgresUser + ":" + $postgresPassword + "@db:5432/" + $postgresDb
if (-not $databaseUrl.Contains($expectedDbSegment)) {
  throw "DATABASE_URL must use the configured POSTGRES_USER, POSTGRES_PASSWORD and POSTGRES_DB with host db:5432."
}
$previousTag = Get-EnvValue "USD_IMAGE_TAG"
if (-not $previousTag) { throw "USD_IMAGE_TAG is missing from .env" }

$headers = @{ "Accept" = "application/vnd.github+json"; "User-Agent" = "USD-Laptop-Updater" }
$commit = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/commits/main" -Headers $headers -TimeoutSec 20
$newTag = "sha-$($commit.sha)"

if ($previousTag -eq $newTag) {
  Write-Host "USD is already configured for main commit $($commit.sha). Checking health."
  Invoke-Compose @("ps")
  if (Wait-ForHealth) {
    Write-Host "USD is healthy on $newTag; no update needed."
    exit 0
  }
  Write-Warning "Health checks failed on the current tag. Attempting to reconcile containers."
  Invoke-Compose @("up", "-d", "--no-build", "--pull", "never")
  if (Wait-ForHealth) {
    Write-Host "USD recovered on $newTag."
    exit 0
  }
  throw "USD remains unhealthy on $newTag. Inspect Docker logs before retrying."
}

Write-Host "Preparing USD update to $newTag. Previous tag: $previousTag"
$previousApiExists = $false
$previousFrontendExists = $false
& docker image inspect "ghcr.io/kolyagazha89/usd-2.0-api:$previousTag" *> $null
$previousApiExists = ($LASTEXITCODE -eq 0)
& docker image inspect "ghcr.io/kolyagazha89/usd-2.0-frontend:$previousTag" *> $null
$previousFrontendExists = ($LASTEXITCODE -eq 0)
$canRollback = $previousApiExists -and $previousFrontendExists
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
  if ($canRollback) {
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
  } else {
    Write-Warning "No complete previous image pair exists locally; this is likely the first install, so automatic image rollback is unavailable."
    Write-Warning "The new image tag remains in .env. Inspect Docker logs and repair the deployment before retrying."
  }
  throw $updateError
}
