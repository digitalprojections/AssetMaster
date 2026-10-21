param(
    [switch]$Remote,
    [string]$HostName = '57.180.42.104',
    [string]$KeyPath = (Join-Path $PSScriptRoot '../../LightsailDefaultKey-ap-northeast-1.pem')
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not $Remote) {
    & php (Join-Path $PSScriptRoot 'test-feature-request.php')
    if ($LASTEXITCODE -ne 0) { throw 'Feature request backend tests failed.' }
    exit
}
# Stream source and tests to PHP stdin: no deployment and no outbound email.
$backend = [IO.File]::ReadAllText((Join-Path $root 'public/api/feature-request.php')).Replace("if (!defined('ASSETMASTER_FEEDBACK_TEST')) feature_request_main();", '')
$checks = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'test-feature-request.php')).Replace('<?php', '').Replace("require __DIR__ . '/../public/api/feature-request.php';", '')
$previousEncoding = $OutputEncoding
try {
    $OutputEncoding = [Text.UTF8Encoding]::new($false)
    # Base64 preserves Unicode and avoids a Windows pipeline BOM before PHP's strict declaration.
    $payload = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($backend + $checks))
    $payload | & ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -i $KeyPath "ubuntu@$HostName" "php -r 'eval(substr(base64_decode(stream_get_contents(STDIN)), 5));'"
    if ($LASTEXITCODE -ne 0) { throw 'Feature request backend tests failed.' }
} finally { $OutputEncoding = $previousEncoding }
