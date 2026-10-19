param([string]$SigningCertificateThumbprint)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Push-Location (Join-Path $root 'mcp')
try {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'MCP build failed.' }
    & node scripts/package.mjs
    if ($LASTEXITCODE -ne 0) { throw 'MCP packaging failed.' }
    $version = (Get-Content package.json -Raw | ConvertFrom-Json).version
    $stage = Join-Path $root "release\mcp\$version\windows-x64"
    $signed = $false
    if ($SigningCertificateThumbprint) {
        $certificate = Get-Item -LiteralPath "Cert:\CurrentUser\My\$SigningCertificateThumbprint" -ErrorAction Stop
        foreach ($name in @('install.ps1', 'uninstall.ps1')) {
            $signature = Set-AuthenticodeSignature -LiteralPath (Join-Path $stage $name) -Certificate $certificate -HashAlgorithm SHA256 -TimestampServer 'http://timestamp.digicert.com'
            if ($signature.Status -ne 'Valid') { throw "Signature verification failed: $name" }
        }
        $signed = $true
    }
    $env:ASSETMASTER_MCP_SCRIPTS_SIGNED = $signed.ToString().ToLowerInvariant()
    & node scripts/finalize-package.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Release manifest failed.' }
    $archive = Join-Path $root "public\downloads\assetmaster-mcp-$version-windows-x64.zip"
    if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive }
    Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $archive -CompressionLevel Optimal
    & node scripts/finalize-package.mjs --checksums
    if ($LASTEXITCODE -ne 0) { throw 'Download checksums failed.' }
    Write-Host "Created $archive"
} finally {
    Remove-Item Env:ASSETMASTER_MCP_SCRIPTS_SIGNED -ErrorAction SilentlyContinue
    Pop-Location
}
