$ErrorActionPreference = 'Stop'

$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { "$env:USERPROFILE\.dsh" }
$port = if ($env:DSH_PORT) { $env:DSH_PORT } else { 3080 }
$pidFile = Join-Path $dshHome "dsh.pid"

$pidsToStop = [System.Collections.Generic.HashSet[int]]::new()

if (Test-Path $pidFile) {
    $filePid = (Get-Content $pidFile -ErrorAction SilentlyContinue).Trim()
    if ($filePid -match '^\d+$') {
        $pidsToStop.Add([int]$filePid) | Out-Null
    }
}

$listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
foreach ($l in $listeners) {
    $pidsToStop.Add($l.OwningProcess) | Out-Null
}

$dshProcs = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*dsh*web*" -or $_.CommandLine -like "*--profile web*" }
foreach ($p in $dshProcs) {
    $pidsToStop.Add($p.ProcessId) | Out-Null
}

if ($pidsToStop.Count -eq 0) {
    Write-Host "DSH is not running."
    if (Test-Path $pidFile) { Remove-Item $pidFile -Force -ErrorAction SilentlyContinue }
    exit 0
}

foreach ($targetPid in $pidsToStop) {
    try {
        $p = Get-Process -Id $targetPid -ErrorAction SilentlyContinue
        if ($p) {
            Write-Host "Stopping DSH process (PID $targetPid)..."
            Stop-Process -Id $targetPid -Force -ErrorAction SilentlyContinue
        }
    } catch {
        # ignore
    }
}

if (Test-Path $pidFile) {
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}
Write-Host "DSH stopped successfully."
