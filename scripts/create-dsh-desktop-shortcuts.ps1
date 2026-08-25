$ErrorActionPreference = 'Stop'

$desktop = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell
$items = @(
    @{ Name = 'DSH Start.lnk'; Script = 'dsh-start.bat' },
    @{ Name = 'DSH Stop.lnk'; Script = 'dsh-stop.bat' }
)

foreach ($item in $items) {
    $scriptPath = Join-Path $PSScriptRoot $item.Script
    if (-not (Test-Path -LiteralPath $scriptPath)) {
        throw "Script not found: $scriptPath"
    }

    $shortcutPath = Join-Path $desktop $item.Name
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $scriptPath
    $shortcut.WorkingDirectory = $env:USERPROFILE
    $shortcut.IconLocation = "$env:SystemRoot\System32\wsl.exe,0"
    $shortcut.Save()
    Write-Output $shortcutPath
}
