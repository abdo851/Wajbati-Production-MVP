# Owner-attended admin bootstrap. Password never goes to argv, git, or project files.
# Result status only is written to %TEMP%\righ-bootstrap-result.json
$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$resultPath = Join-Path $env:TEMP "righ-bootstrap-result.json"
$passPath = Join-Path $env:TEMP ("righ-bootstrap-pass-" + [guid]::NewGuid().ToString("N") + ".tmp")

function Write-Result($obj) {
  $obj | ConvertTo-Json -Compress | Set-Content -Path $resultPath -Encoding utf8
}

try {
  Write-Host ""
  Write-Host "RIGH admin bootstrap (primary Supabase only)"
  Write-Host "Email: ab***@gmail.com"
  Write-Host "Project: npgoovxofxoheghlqlky"
  Write-Host ""
  Write-Host "Enter the temporary admin password (input hidden)."
  Write-Host "Requirements: >=12 chars, upper, lower, digit."
  $secure = Read-Host -AsSecureString "Password"
  if (-not $secure -or $secure.Length -eq 0) {
    Write-Result @{ ok = $false; stage = "password"; reason = "empty_password" }
    Write-Host "Refused: empty password."
    exit 1
  }

  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }

  # Write password only to a unique temp file outside the repo; deleted immediately after use.
  [IO.File]::WriteAllText($passPath, $plain)
  $plain = $null
  $secure = $null

  $env:RIGH_BOOTSTRAP_ADMIN_EMAIL = "abderrahimallali92@gmail.com"
  $env:RIGH_ALLOW_PRIMARY_ADMIN_BOOTSTRAP = "1"
  $env:RIGH_BOOTSTRAP_TARGET_REF = "npgoovxofxoheghlqlky"
  $env:RIGH_BOOTSTRAP_ADMIN_PASSWORD_FILE = $passPath
  Remove-Item Env:RIGH_BOOTSTRAP_ADMIN_PASSWORD -ErrorAction SilentlyContinue

  $output = & node "scripts/bootstrap-admin.mjs" 2>&1
  $code = $LASTEXITCODE
  $text = ($output | Out-String).Trim()

  # Scrub any accidental secret-looking content from captured output before persisting status.
  if ($text -match '(?i)(password|salt:|scrypt)') {
    $text = '{"ok":false,"reason":"output_scrubbed_possible_secret"}'
  }

  Write-Result @{
    ok = ($code -eq 0)
    exitCode = $code
    stage = "bootstrap"
    output = $text
  }

  if ($code -eq 0) {
    Write-Host ""
    Write-Host "Bootstrap finished successfully. Close this window."
  } else {
    Write-Host ""
    Write-Host "Bootstrap failed. Close this window and check the agent report."
  }
  exit $code
}
catch {
  Write-Result @{ ok = $false; stage = "exception"; reason = "owner_script_error" }
  Write-Host "Error during bootstrap (details omitted from result file)."
  exit 1
}
finally {
  Remove-Item Env:RIGH_ALLOW_PRIMARY_ADMIN_BOOTSTRAP -ErrorAction SilentlyContinue
  Remove-Item Env:RIGH_BOOTSTRAP_TARGET_REF -ErrorAction SilentlyContinue
  Remove-Item Env:RIGH_BOOTSTRAP_ADMIN_EMAIL -ErrorAction SilentlyContinue
  Remove-Item Env:RIGH_BOOTSTRAP_ADMIN_PASSWORD_FILE -ErrorAction SilentlyContinue
  Remove-Item Env:RIGH_BOOTSTRAP_ADMIN_PASSWORD -ErrorAction SilentlyContinue
  if (Test-Path $passPath) {
    try {
      $empty = New-Object byte[] (Get-Item $passPath).Length
      [IO.File]::WriteAllBytes($passPath, $empty)
    } catch {}
    Remove-Item -Force $passPath -ErrorAction SilentlyContinue
  }
}
