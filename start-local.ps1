param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$logDir = Join-Path $projectRoot 'local-logs'
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
function Test-Http($Url) {
    try { return (Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200 }
    catch { return $false }
}
function Test-Docker {
    $dockerExe = (Get-Command docker).Source
    $probe = Start-Process -FilePath $dockerExe -ArgumentList @('info', '--format', '{{.ServerVersion}}') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDir 'docker-check.out.log') -RedirectStandardError (Join-Path $logDir 'docker-check.err.log')
    if (-not $probe.WaitForExit(8000)) { $probe.Kill(); return $false }
    $probe.Refresh()
    return $probe.ExitCode -eq 0
}
function Invoke-Compose([string[]]$Arguments) {
    $ErrorActionPreference = 'Continue'
    & docker compose -f docker-compose.yml -f compose.local.yml @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Docker Compose failed. See the output above." }
}
function Test-BackendImage {
    $ErrorActionPreference = 'Continue'
    & docker image inspect llm-graph-builder-backend:latest *> $null
    return $LASTEXITCODE -eq 0
}
try {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker CLI is not installed or not on PATH.' }
    if (-not (Test-Docker)) {
        $desktop = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
        if (-not (Test-Path -LiteralPath $desktop)) { throw 'Docker Desktop was not found.' }
        if (-not (Get-Process 'Docker Desktop','com.docker.backend' -ErrorAction SilentlyContinue)) {
            Start-Process -FilePath $desktop -WindowStyle Hidden
        }
        # An offline engine can still be starting. Never kill it or delete live sockets.
        Wait-Ready 'Docker' { Test-Docker } 180
    }
    if (-not (Test-Path -LiteralPath 'backend\.env')) { throw 'backend/.env is missing. Configure it before starting.' }
    if (-not (Test-BackendImage)) {
        Write-Host 'Building the backend for the first time. This may take a while.'
        Invoke-Compose @('build', 'backend')
    }
    Invoke-Compose @('up', '-d', '--no-build', 'database')
    Wait-Ready 'Neo4j' { Test-Http 'http://127.0.0.1:7474' } 120
    Invoke-Compose @('up', '-d', '--no-build', 'backend')
    Wait-Ready 'Backend' { Test-Http 'http://127.0.0.1:8000/docs' } 180

    $frontPort = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue
    if ($frontPort) {
        $page = Invoke-WebRequest 'http://127.0.0.1:8080/' -Headers @{Accept='text/html'} -UseBasicParsing -TimeoutSec 10
        if ($page.Content -notmatch '/src/main|/@vite/client') { throw 'Port 8080 is occupied by another service. Close that service first.' }
    } else {
        $node = (Get-Command node -ErrorAction SilentlyContinue).Source
        if (-not $node) { throw 'Node.js was not found on PATH.' }
        $frontDir = Join-Path $projectRoot 'frontend'
        $vite = Join-Path $frontDir 'node_modules\vite\bin\vite.js'
        if (-not (Test-Path -LiteralPath $vite)) {
            Push-Location -LiteralPath $frontDir
            try {
                & npm.cmd install --ignore-scripts --no-audit --no-fund
                if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
            } finally { Pop-Location }
        }
        Start-Process -FilePath $node -ArgumentList @('node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '8080', '--strictPort') -WorkingDirectory $frontDir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'frontend.out.log') -RedirectStandardError (Join-Path $logDir 'frontend.err.log')
    }
    Wait-Ready 'Frontend' { Test-Http 'http://127.0.0.1:8080/index.html' } 60
    $node = (Get-Command node -ErrorAction SilentlyContinue).Source
    if (-not $node) { throw 'Node.js was not found on PATH.' }
    $uiDir = Join-Path $projectRoot 'ui-reference'
    $uiPort = Get-NetTCPConnection -LocalPort 3015 -State Listen -ErrorAction SilentlyContinue
    if ($uiPort) {
        $uiPage = Invoke-WebRequest 'http://127.0.0.1:3015/' -UseBasicParsing -TimeoutSec 10
        if ($uiPage.Content -notmatch 'KnowTrace') { throw 'Port 3015 is occupied by another service.' }
    } else {
        $uiVite = Join-Path $uiDir 'node_modules\vite\bin\vite.js'
        if (-not (Test-Path -LiteralPath $uiVite)) {
            Push-Location -LiteralPath $uiDir
            try {
                & npm.cmd install --ignore-scripts --no-audit --no-fund
                if ($LASTEXITCODE -ne 0) { throw 'New UI dependency installation failed.' }
            } finally { Pop-Location }
        }
        Start-Process -FilePath $node -ArgumentList @('node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '3015', '--strictPort') -WorkingDirectory $uiDir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'course-ui.out.log') -RedirectStandardError (Join-Path $logDir 'course-ui.err.log')
    }
    Wait-Ready 'Course UI' { Test-Http 'http://127.0.0.1:3015/' } 60
    Write-Host 'Course UI: http://127.0.0.1:3015/' -ForegroundColor Green
    Write-Host 'Original graph builder: http://127.0.0.1:8080/'
    if (-not $NoBrowser) { Start-Process 'http://127.0.0.1:3015/' }
} catch {
    $startupError = $_
    $ErrorActionPreference = 'Continue'
    if ((Get-Command docker -ErrorAction SilentlyContinue) -and (Test-Docker)) {
        & docker compose -f docker-compose.yml -f compose.local.yml logs --tail 100 backend database *> (Join-Path $logDir 'services.log')
    }
    $startupError | Out-String | Set-Content -LiteralPath (Join-Path $logDir 'startup-error.log') -Encoding UTF8
    Write-Host $startupError.Exception.Message -ForegroundColor Red
    exit 1
}
