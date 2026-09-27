$ErrorActionPreference = 'Stop'

$desktop = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell
$items = @(
    @{ Name = 'DSH Start.lnk'; Script = 'dsh-start.bat'; Icon = 'C:\Program Files\nodejs\node.exe,0' },
    @{ Name = 'DSH Stop.lnk'; Script = 'dsh-stop.bat'; Icon = 'shell32.dll,27' }
)

foreach ($item in $items) {
    $scriptPath = Join-Path $PSScriptRoot $item.Script
    if (-not (Test-Path -LiteralPath $scriptPath)) {
        throw "Script not found: $scriptPath"
    }

    $shortcutPath = Join-Path $desktop $item.Name
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $scriptPath
    $shortcut.WorkingDirectory = $PSScriptRoot
    $shortcut.IconLocation = $item.Icon
    $shortcut.Save()
    Write-Output $shortcutPath
}
