param([string]$InstallRoot = (Join-Path $env:LOCALAPPDATA 'AssetMaster\MCP'), [string]$Workspace)
$ErrorActionPreference = 'Stop'
function Get-AssetMasterSha256([string]$FilePath) {
    $stream = [IO.File]::OpenRead($FilePath)
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
    finally { $stream.Dispose(); $algorithm.Dispose() }
}

$manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'release.json') -Raw | ConvertFrom-Json
if ($manifest.product -ne 'AssetMaster MCP' -or $manifest.version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid AssetMaster release manifest.' }
$source = [IO.Path]::GetFullPath($PSScriptRoot)
foreach ($entry in $manifest.files) {
    $file = [IO.Path]::GetFullPath((Join-Path $source $entry.path))
    if (-not $file.StartsWith($source + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Release file is outside the package.' }
    if ((Get-AssetMasterSha256 $file) -ne $entry.sha256) { throw "Release checksum failed: $($entry.path)" }
}
$root = [IO.Path]::GetFullPath($InstallRoot)
$target = Join-Path $root $manifest.version
if (Test-Path -LiteralPath $target) { throw 'This version is already installed. Use its configuration or uninstall that version first.' }
if ($Workspace) { $Workspace = (Resolve-Path -LiteralPath $Workspace).Path; if (-not (Test-Path -LiteralPath $Workspace -PathType Container)) { throw 'Workspace must be a folder.' } }
New-Item -ItemType Directory -Path $target -Force | Out-Null
Get-ChildItem -LiteralPath $source -Force | Copy-Item -Destination $target -Recurse
$arguments = @((Join-Path $target 'dist\index.js'), '--config')
if ($Workspace) { $arguments += @('--workspace', $Workspace) }
& (Join-Path $target 'runtime\node.exe') @arguments
if ($LASTEXITCODE -ne 0) { throw 'Installed companion configuration check failed.' }
Write-Host "Installed AssetMaster MCP $($manifest.version) at $target"
Write-Host 'Add the configuration above to your AI application. Set --workspace to the asset folder you want it to use. User files and client settings were not modified.'
