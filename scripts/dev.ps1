# Windows equivalent of `make dev`: backend on :8000 and frontend on :3000, each in
# its own window. Close the windows (or Ctrl+C in each) to stop them.
$root = Split-Path -Parent $PSScriptRoot

Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$env:PYTHONIOENCODING='utf-8'; Set-Location '$root\backend'; .\.venv\Scripts\uvicorn app.main:app --reload --port 8000"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\frontend'; npm run dev"

Write-Host "Starting... open http://localhost:3000 in a few seconds (log in as student@demo.com / demo1234)."
