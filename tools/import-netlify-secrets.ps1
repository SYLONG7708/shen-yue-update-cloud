param(
  [string]$AppsScriptEndpoint = "https://script.google.com/macros/s/AKfycbwrUCUeksZrWOUSDrdKgUGTS1JIPRX3c18PIKgZu_j64jBZGXjI7rnHTFjmIqUljZFzeg/exec"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$deployDir = Join-Path $projectRoot "output\deploy"
New-Item -ItemType Directory -Force -Path $deployDir | Out-Null

$temporaryEnv = Join-Path $deployDir ".netlify-env-import.tmp"
$temporaryLog = Join-Path $deployDir ".netlify-env-import.log"
$uploadKeyPath = Join-Path $deployDir "upload-key.txt"

$bytes = New-Object byte[] 24
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try {
  $rng.GetBytes($bytes)
} finally {
  $rng.Dispose()
}
$uploadKey = ([BitConverter]::ToString($bytes)).Replace("-", "").ToLowerInvariant()
$githubToken = (& gh auth token).Trim()
if (-not $githubToken) {
  throw "New GitHub token unavailable."
}

$lines = @(
  "SHENYUE_UPLOAD_KEY=$uploadKey",
  "GITHUB_TOKEN=$githubToken",
  "APPS_SCRIPT_ENDPOINT=$AppsScriptEndpoint",
  "GITHUB_OWNER=SYLONG7708",
  "GITHUB_UPDATE_REPO=update",
  "GITHUB_ASSISTANT_REPO=shen-yue-iphone-assistant",
  "GITHUB_RELEASE_TAG=apk-cloud"
)

[IO.File]::WriteAllLines($temporaryEnv, $lines, [Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText($uploadKeyPath, $uploadKey, [Text.Encoding]::ASCII)

try {
  $npx = (Get-Command npx.cmd -ErrorAction Stop).Source
  $temporaryErrorLog = "$temporaryLog.err"
  $process = Start-Process -FilePath $npx `
    -ArgumentList @("--yes", "netlify", "env:import", $temporaryEnv, "--replace-existing") `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $temporaryLog `
    -RedirectStandardError $temporaryErrorLog `
    -Wait `
    -PassThru
  if ($process.ExitCode -ne 0) {
    throw "Netlify env import failed with exit code $($process.ExitCode)."
  }
} finally {
  if (Test-Path -LiteralPath $temporaryEnv) {
    [IO.File]::WriteAllText($temporaryEnv, "", [Text.Encoding]::ASCII)
    Remove-Item -LiteralPath $temporaryEnv -Force
  }
  if (Test-Path -LiteralPath $temporaryLog) {
    [IO.File]::WriteAllText($temporaryLog, "", [Text.Encoding]::ASCII)
    Remove-Item -LiteralPath $temporaryLog -Force
  }
  $temporaryErrorLog = "$temporaryLog.err"
  if (Test-Path -LiteralPath $temporaryErrorLog) {
    [IO.File]::WriteAllText($temporaryErrorLog, "", [Text.Encoding]::ASCII)
    Remove-Item -LiteralPath $temporaryErrorLog -Force
  }
}

[pscustomobject]@{
  Imported = $true
  VariableNames = @(
    "SHENYUE_UPLOAD_KEY",
    "GITHUB_TOKEN",
    "APPS_SCRIPT_ENDPOINT",
    "GITHUB_OWNER",
    "GITHUB_UPDATE_REPO",
    "GITHUB_ASSISTANT_REPO",
    "GITHUB_RELEASE_TAG"
  )
  UploadKeyFile = $uploadKeyPath
  TemporaryFilesRemoved = $true
}
