param([string]$Archive, [string]$Target)
$ErrorActionPreference = 'Stop'
Expand-Archive -LiteralPath $Archive -DestinationPath $Target -Force
