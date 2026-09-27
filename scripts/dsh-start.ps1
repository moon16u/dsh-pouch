$ErrorActionPreference = 'Stop'

$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { "$env:USERPROFILE\.dsh" }
$port = if ($env:DSH_PORT) { $env:DSH_PORT } else { 3080 }
$log = Join-Path $dshHome "dsh-web.out.log"
$pidFile = Join-Path $dshHome "dsh.pid"

if (-not (Test-Path $dshHome)) {
    New-Item -ItemType Directory -Path $dshHome -Force | Out-Null
}

# Check if already listening on port
$conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conn) {
    Write-Host "DSH is already running (PID $($conn.OwningProcess)) at http://127.0.0.1:$port/"
    Set-Content -Path $pidFile -Value $conn.OwningProcess -Force
    exit 0
}

# Refresh PATH for current script
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
$env:NODE_USE_ENV_PROXY = "1"
$env:NODE_OPTIONS = "--use-env-proxy"
$env:HTTP_PROXY = "http://127.0.0.1:10808"
$env:HTTPS_PROXY = "http://127.0.0.1:10808"
$env:DSH_HOME = $dshHome

$workspaceDir = "D:\Agent YueJian"
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content -Path $log -Value "`n=== manual DSH start $timestamp ==="

$nodeExe = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $nodeExe) {
    $nodeExe = "C:\Program Files\nodejs\node.exe"
}

$dshBinJs = "D:\npm-global\node_modules\@deepseek-ai\dsh\lib\bin.js"
if (-not (Test-Path $dshBinJs)) {
    $npmPrefix = (npm config get prefix).Trim()
    $dshBinJs = Join-Path $npmPrefix "node_modules\@deepseek-ai\dsh\lib\bin.js"
}

$errLog = Join-Path $dshHome "dsh-web.err.log"

$proc = Start-Process -FilePath $nodeExe `
    -ArgumentList "`"$dshBinJs`"", "--profile", "web", "--no-open" `
    -WorkingDirectory $workspaceDir `
    -RedirectStandardOutput $log `
    -RedirectStandardError $errLog `
    -WindowStyle Hidden `
    -PassThru

Set-Content -Path $pidFile -Value $proc.Id -Force

Write-Host "Starting DSH (PID $($proc.Id)) in background..."
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 500
    if ($proc.HasExited) {
        Write-Error "DSH process exited prematurely with code $($proc.ExitCode). Check log: $log"
        exit 1
    }
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) {
        Write-Host "DSH is ready (PID $($proc.Id))"
        Write-Host "URL: http://127.0.0.1:$port/"
        Write-Host "Log: $log"
        exit 0
    }
}

Write-Error "DSH did not become ready on port $port within 30 seconds. Check log: $log"
exit 1
