$ErrorActionPreference = 'Stop'
$target = [IO.Path]::GetFullPath($PSScriptRoot)
$manifestPath = Join-Path $target 'release.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.product -ne 'AssetMaster MCP' -or $manifest.version -notmatch '^\d+\.\d+\.\d+$' -or (Split-Path $target -Leaf) -ne $manifest.version) { throw 'This uninstaller must run from an installed AssetMaster MCP version folder.' }
$parent = [IO.Path]::GetFullPath((Split-Path $target -Parent))
if ($target -ne [IO.Path]::GetFullPath((Join-Path $parent $manifest.version))) { throw 'Uninstall path verification failed.' }
$running = Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq (Join-Path $target 'runtime\node.exe') }
if ($running) { throw 'Stop the AssetMaster MCP connection before uninstalling.' }
# Remove only files shipped in the manifest. Never recursively remove a user-selected folder.
foreach ($entry in $manifest.files) {
    $file = [IO.Path]::GetFullPath((Join-Path $target $entry.path))
    if (-not $file.StartsWith($target + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid uninstall manifest path.' }
    if (Test-Path -LiteralPath $file -PathType Leaf) { Remove-Item -LiteralPath $file }
}
Remove-Item -LiteralPath $manifestPath
Get-ChildItem -LiteralPath $target -Directory -Recurse | Sort-Object { $_.FullName.Length } -Descending | ForEach-Object { if (-not (Get-ChildItem -LiteralPath $_.FullName -Force)) { Remove-Item -LiteralPath $_.FullName } }
if (-not (Get-ChildItem -LiteralPath $target -Force)) { Remove-Item -LiteralPath $target }
Write-Host "Uninstalled AssetMaster MCP $($manifest.version). User assets and client settings are preserved."
