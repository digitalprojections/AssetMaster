param(
    [string]$HostName = '57.180.42.104',
    [string]$KeyPath = (Join-Path $PSScriptRoot '../../LightsailDefaultKey-ap-northeast-1.pem')
)
$ErrorActionPreference = 'Stop'
$configPath = Join-Path $PSScriptRoot '../.private/assetmaster-feedback.json'
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
if (-not $config.smtpUsername -or -not $config.smtpPassword -or -not $config.sender -or -not $config.recipient) { throw 'Private SMTP configuration is incomplete.' }
$options = @('-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-i', $KeyPath)
$target = "ubuntu@$HostName"
$remoteTemporary = (& ssh @options $target 'mktemp -d /tmp/assetmaster-feedback.XXXXXXXX').Trim()
if ($LASTEXITCODE -ne 0 -or $remoteTemporary -notmatch '^/tmp/assetmaster-feedback\.[A-Za-z0-9]+$') { throw 'Could not create a protected transfer directory.' }
try {
    & scp @options -q $configPath "${target}:${remoteTemporary}/config.json"
    if ($LASTEXITCODE -ne 0) { throw 'Private configuration transfer failed.' }
    & ssh @options $target "sudo test ! -e /home/ubuntu/migration/assetmaster-private/assetmaster-feedback.json && sudo install -d -m 750 -o root -g www-data /home/ubuntu/migration/assetmaster-private && sudo install -m 640 -o root -g www-data $remoteTemporary/config.json /home/ubuntu/migration/assetmaster-private/assetmaster-feedback.json && sudo install -d -m 750 -o www-data -g www-data /home/ubuntu/migration/assetmaster-private/assetmaster-feedback-rate"
    if ($LASTEXITCODE -ne 0) { throw 'Private configuration installation failed; existing configuration is never replaced.' }
    Write-Host 'Private SMTP configuration installed outside the document root.'
} finally {
    & ssh @options $target "rm -f -- $remoteTemporary/config.json && rmdir -- $remoteTemporary"
}
