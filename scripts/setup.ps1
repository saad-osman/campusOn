# Windows equivalent of `make setup && make migrate && make seed`.
# Run from the repo root:  powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

# Windows PowerShell doesn't stop on a failing native command, so check each one.
function Invoke-Step([string]$what, [scriptblock]$cmd) {
  & $cmd
  if ($LASTEXITCODE -ne 0) { throw "$what failed (exit code $LASTEXITCODE)" }
}

Write-Host "== Backend: venv + dependencies =="
Push-Location "$root\backend"
try {
  if (-not (Test-Path ".venv")) { Invoke-Step "Creating the virtualenv" { python -m venv .venv } }
  Invoke-Step "Upgrading pip" { .\.venv\Scripts\python -m pip install --quiet --upgrade pip }
  Invoke-Step "Installing backend requirements" { .\.venv\Scripts\python -m pip install --quiet -r requirements.txt }
  if (-not (Test-Path ".env")) {
    $secret = (.\.venv\Scripts\python -c "import secrets; print(secrets.token_urlsafe(48))").Trim()
    (Get-Content "$root\.env.example") -replace "^SECRET_KEY=.*", "SECRET_KEY=$secret" | Set-Content -Encoding utf8 ".env"
    Write-Host "created backend\.env with a random SECRET_KEY"
  }
  Write-Host "== Database: migrate + seed demo data =="
  $env:PYTHONIOENCODING = "utf-8"
  Invoke-Step "Database migration" { .\.venv\Scripts\python -m alembic upgrade head }
  Invoke-Step "Seeding demo data" { .\.venv\Scripts\python -m app.seed }
} finally { Pop-Location }

Write-Host "== Frontend: npm install =="
Push-Location "$root\frontend"
try {
  Invoke-Step "npm install" { npm install }
  if (-not (Test-Path ".env.local")) { "BACKEND_URL=http://localhost:8000" | Out-File -Encoding utf8 ".env.local" }
} finally { Pop-Location }

Write-Host "Done. Start the app with: powershell -ExecutionPolicy Bypass -File scripts\dev.ps1"
