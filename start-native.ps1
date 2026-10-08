param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$logDir = Join-Path $projectRoot 'local-logs'
$neo4jHome = 'D:\neo4j'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
Set-Location -LiteralPath $projectRoot

function Wait-Ready($Label, [scriptblock]$Check, $Seconds) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    Write-Host "Waiting for $Label ..."
    do {
        if (& $Check) { Write-Host "$Label is ready."; return }
        Start-Sleep -Seconds 3
    } while ((Get-Date) -lt $deadline)
    throw "$Label did not become ready in $Seconds seconds. Check local-logs."
}
function Test-Http($Url, [string]$Accept = '*/*') {
    try {
        $r = Invoke-WebRequest -Uri $Url -Headers @{Accept = $Accept} -UseBasicParsing -TimeoutSec 5
        return $r.StatusCode -eq 200
    } catch { return $false }
}
function Get-Listener($Port) {
    return Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
}
function Start-LoggedProcess($FilePath, [string[]]$Arguments, $WorkingDir, $LogName) {
    Start-Process -FilePath $FilePath -ArgumentList $Arguments -WorkingDirectory $WorkingDir `
        -RedirectStandardOutput (Join-Path $logDir "$LogName.out.log") `
        -RedirectStandardError (Join-Path $logDir "$LogName.err.log") | Out-Null
}
try {
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'backend\.env'))) {
        throw 'backend/.env is missing. Copy backend/example.env first and fill Neo4j credentials.'
    }
    if (-not (Get-Listener 7474)) {
        if (-not (Test-Path -LiteralPath (Join-Path $neo4jHome 'bin\neo4j.bat'))) { throw "Neo4j not found at $neo4jHome." }
        Write-Host 'Starting Neo4j ...'
        Start-LoggedProcess (Join-Path $neo4jHome 'bin\neo4j.bat') @('console') $neo4jHome 'neo4j'
    }
    Wait-Ready 'Neo4j' { Test-Http 'http://127.0.0.1:7474/' } 120
    if (-not (Test-Http 'http://127.0.0.1:7474/db/neo4j/settings')) {
        if (Test-Http 'http://127.0.0.1:7474/') {
            $pair = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes('neo4j:localdemo1234'))
            try {
                Invoke-WebRequest -Uri 'http://127.0.0.1:7474/db/neo4j/tx/commit' -Method Post -Headers @{Authorization = "Basic $pair"} `
                    -ContentType 'application/json' -Body '{"statements":[{"statement":"RETURN 1"}]}' -UseBasicParsing -TimeoutSec 8 | Out-Null
            } catch { throw 'Port 7474 is occupied by a Neo4j with unknown credentials.' }
        } else { throw 'Port 7474 is occupied by another service.' }
    }

    if (-not (Test-Http 'http://127.0.0.1:8000/docs')) {
        if (Get-Listener 8000) { throw 'Port 8000 is occupied by another service.' }
        $node = (Get-Command node -ErrorAction SilentlyContinue).Source
        $py = Join-Path $projectRoot 'backend\venv\Scripts\python.exe'
        if (-not $node) { throw 'Node.js was not found on PATH.' }
        if (-not (Test-Path -LiteralPath $py)) { throw 'backend\venv is missing. Run: python -m venv venv && venv\Scripts\pip install -r requirements.txt' }
        Write-Host 'Starting backend ...'
        Start-LoggedProcess $py @('-m', 'uvicorn', 'score:app', '--host', '127.0.0.1', '--port', '8000') (Join-Path $projectRoot 'backend') 'backend'
    }
    Wait-Ready 'Backend' { Test-Http 'http://127.0.0.1:8000/docs' } 180

    if (-not (Test-Http 'http://127.0.0.1:8080/index.html')) {
        if (Get-Listener 8080) { throw 'Port 8080 is occupied by another service.' }
        $node = (Get-Command node -ErrorAction SilentlyContinue).Source
        if (-not $node) { throw 'Node.js was not found on PATH.' }
        $frontDir = Join-Path $projectRoot 'frontend'
        if (-not (Test-Path -LiteralPath (Join-Path $frontDir 'node_modules\vite\bin\vite.js'))) {
            Push-Location -LiteralPath $frontDir
            try {
                & npm.cmd install --ignore-scripts --no-audit --no-fund
                if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
            } finally { Pop-Location }
        }
        Write-Host 'Starting debug UI (8080) ...'
        Start-LoggedProcess $node @((Join-Path $frontDir 'node_modules\vite\bin\vite.js'), '--host', '127.0.0.1', '--port', '8080', '--strictPort') $frontDir 'frontend'
    }
    Wait-Ready 'Debug UI' { Test-Http 'http://127.0.0.1:8080/index.html' } 120

    if (-not (Test-Http 'http://127.0.0.1:3015/' 'text/html')) {
        if (Get-Listener 3015) { throw 'Port 3015 is occupied by another service.' }
        $node = (Get-Command node -ErrorAction SilentlyContinue).Source
        if (-not $node) { throw 'Node.js was not found on PATH.' }
        $uiDir = Join-Path $projectRoot 'ui-reference'
        if (-not (Test-Path -LiteralPath (Join-Path $uiDir 'node_modules\vite\bin\vite.js'))) {
            Push-Location -LiteralPath $uiDir
            try {
                & npm.cmd ci --ignore-scripts --no-audit --no-fund
                if ($LASTEXITCODE -ne 0) { throw 'Course UI dependency installation failed.' }
            } finally { Pop-Location }
        }
        Write-Host 'Starting course UI (3015) ...'
        Start-LoggedProcess $node @((Join-Path $uiDir 'node_modules\vite\bin\vite.js'), '--host', '127.0.0.1', '--port', '3015', '--strictPort') $uiDir 'course-ui'
    }
    Wait-Ready 'Course UI' { Test-Http 'http://127.0.0.1:3015/' 'text/html' } 120

    Write-Host 'Course UI:     http://127.0.0.1:3015/' -ForegroundColor Green
    Write-Host 'Debug UI:      http://127.0.0.1:8080/'
    Write-Host 'Backend API:   http://127.0.0.1:8000/docs'
    if (-not $NoBrowser) { Start-Process 'http://127.0.0.1:3015/' }
} catch {
    $startupError = $_
    $startupError | Out-String | Set-Content -LiteralPath (Join-Path $logDir 'startup-error.log') -Encoding UTF8
    Write-Host $startupError.Exception.Message -ForegroundColor Red
    exit 1
}
