$ErrorActionPreference = 'Stop'
function Get-AssetMasterSha256([string]$FilePath) {
    $stream = [IO.File]::OpenRead($FilePath)
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
    finally { $stream.Dispose(); $algorithm.Dispose() }
}

$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$release = Get-Content -LiteralPath (Join-Path $root 'public\downloads\mcp-release.json') -Raw | ConvertFrom-Json
foreach ($file in $release.downloads) {
    $full = Join-Path $root "public\downloads\$($file.name)"
    if ((Get-AssetMasterSha256 $full) -ne $file.sha256) { throw "Download checksum failed: $($file.name)" }
}
$testRoot = Join-Path $root ('.browser-test\mcp\package-' + [Guid]::NewGuid().ToString('N'))
$extracted = Join-Path $testRoot 'extracted'
$installRoot = Join-Path $testRoot 'installed'
$workspace = Join-Path $testRoot 'assets'
New-Item -ItemType Directory -Path $workspace -Force | Out-Null
$sentinel = Join-Path $workspace 'keep.txt'
Set-Content -LiteralPath $sentinel -Value 'Preserve user assets'
$archive = Join-Path $root "public\downloads\assetmaster-mcp-$($release.version)-windows-x64.zip"
Expand-Archive -LiteralPath $archive -DestinationPath $extracted
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $extracted 'install.ps1') -InstallRoot $installRoot -Workspace $workspace
if ($LASTEXITCODE -ne 0) { throw 'Installer failed.' }
$installed = Join-Path $installRoot $release.version
$node = Join-Path $installed 'runtime\node.exe'
$entry = Join-Path $installed 'dist\index.js'
$version = & $node $entry --version
if ($LASTEXITCODE -ne 0 -or $version -ne $release.version) { throw 'Installed version mismatch.' }
$doctor = & $node $entry --doctor --port 0 --workspace $workspace | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $doctor.state -ne 'success') { throw 'Installed diagnostics failed.' }
$config = & $node $entry --config --port 0 --workspace $workspace | ConvertFrom-Json
if ($config.mcpServers.assetmaster.command -ne $node -or $config.mcpServers.assetmaster.args[0] -ne $entry) { throw 'Installed configuration mismatch.' }
& node (Join-Path $root 'mcp\scripts\verify-installed.mjs') $node $entry
if ($LASTEXITCODE -ne 0) { throw 'Installed MCP discovery failed.' }
$keep = Join-Path $installed 'keep-user-file.txt'
Set-Content -LiteralPath $keep -Value 'Not part of the distribution'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $installed 'uninstall.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Uninstaller failed.' }
if (Test-Path -LiteralPath $entry) { throw 'Uninstaller left the companion executable.' }
if (-not (Test-Path -LiteralPath $sentinel) -or -not (Test-Path -LiteralPath $keep)) { throw 'Uninstall removed a user file.' }
# Verify the npm tarball can install offline without fetching dependencies or executing lifecycle scripts.
$npmTarget = Join-Path $testRoot 'npm'
& npm.cmd install --prefix $npmTarget --ignore-scripts --offline --no-audit --no-fund (Join-Path $root "public\downloads\assetmaster-mcp-server-$($release.version).tgz")
if ($LASTEXITCODE -ne 0) { throw 'Offline npm installation failed.' }
$npmEntry = Join-Path $npmTarget 'node_modules\assetmaster-mcp-server\dist\index.js'
& node (Join-Path $root 'mcp\scripts\verify-installed.mjs') (Get-Command node.exe).Source $npmEntry
if ($LASTEXITCODE -ne 0) { throw 'Installed npm MCP discovery failed.' }
$evidence = @{ state = 'success'; version = $release.version; checks = @('download checksums', 'Windows install', 'bundled runtime', 'installed config', 'diagnostics', 'installed MCP discovery', 'uninstall', 'user files preserved', 'offline npm install', 'npm MCP discovery'); directory = $testRoot }
$evidence | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $root '.browser-test\mcp\package-evidence.json')
$evidence | ConvertTo-Json -Depth 5
