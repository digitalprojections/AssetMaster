param(
    [string]$HostName = "57.180.42.104",
    [string]$User = "ubuntu",
    [string]$RemoteRoot = "/home/ubuntu/migration/public_html",
    [string]$SiteSubdir = "assetmaster",
    [string]$SiteUrl = "https://created.link/assetmaster/",
    [string]$KeyPath,
    [switch]$SkipBuild,
    [switch]$SkipVerify
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir
$DistDir = Join-Path $RepoRoot "dist"
$RemoteSiteRoot = "$RemoteRoot/$SiteSubdir"
$RemoteStagingRoot = "/tmp/$SiteSubdir-deploy"
$RemoteArchive = "$RemoteStagingRoot.tar.gz"
$SshOptions = @("-o", "StrictHostKeyChecking=accept-new")
$TempArtifacts = [System.Collections.Generic.List[string]]::new()

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,

        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$FilePath failed with exit code $LASTEXITCODE"
    }
}

function Require-Command {
    param([Parameter(Mandatory = $true)][string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' was not found on PATH."
    }
}

function Get-KeyCandidates {
    $parentRepoRoot = Split-Path $RepoRoot -Parent
    $candidateSet = [System.Collections.Generic.List[string]]::new()
    $knownPaths = @(
        (Join-Path $RepoRoot "LightsailDefaultKey-ap-northeast-1.pem"),
        (Join-Path $parentRepoRoot "LightsailDefaultKey-ap-northeast-1.pem"),
        (Join-Path $parentRepoRoot "fuzal-s-portfolio---blog\LightsailDefaultKey-ap-northeast-1.pem"),
        (Join-Path $parentRepoRoot "animateai---frame-by-frame-sketcher\LightsailDefaultKey-ap-northeast-1.pem"),
        (Join-Path $parentRepoRoot "MahjongZen\LightsailDefaultKey-ap-northeast-1.pem"),
        (Join-Path $env:USERPROFILE "Documents\PointsLedgerBase\LightsailDefaultKey-ap-northeast-1.pem")
    )

    foreach ($candidate in $knownPaths) {
        if ([string]::IsNullOrWhiteSpace($candidate)) {
            continue
        }

        if ((Test-Path -LiteralPath $candidate) -and -not $candidateSet.Contains($candidate)) {
            $candidateSet.Add($candidate)
        }
    }

    return $candidateSet
}

function Resolve-KeyPath {
    param([string]$RequestedPath)

    if (-not [string]::IsNullOrWhiteSpace($RequestedPath)) {
        if (-not (Test-Path -LiteralPath $RequestedPath)) {
            throw "SSH key not found: $RequestedPath"
        }

        return (Resolve-Path -LiteralPath $RequestedPath).Path
    }

    foreach ($candidate in (Get-KeyCandidates)) {
        try {
            $resolved = (Resolve-Path -LiteralPath $candidate).Path
            Get-Content -LiteralPath $resolved -TotalCount 1 | Out-Null
            return $resolved
        }
        catch {
            continue
        }
    }

    throw "No readable Lightsail key found. Pass -KeyPath explicitly."
}

function New-SshKeyTempCopy {
    param([Parameter(Mandatory = $true)][string]$SourcePath)

    $tempKeyPath = Join-Path ([System.IO.Path]::GetTempPath()) "$SiteSubdir-lightsail-$([System.Guid]::NewGuid()).pem"
    Copy-Item -LiteralPath $SourcePath -Destination $tempKeyPath -Force

    $grantTarget = if ([string]::IsNullOrWhiteSpace($env:USERDOMAIN)) {
        "$env:USERNAME:(R)"
    } else {
        "$($env:USERDOMAIN)\$($env:USERNAME):(R)"
    }

    Invoke-Checked -FilePath "icacls" -Arguments @($tempKeyPath, "/inheritance:r") | Out-Null
    Invoke-Checked -FilePath "icacls" -Arguments @($tempKeyPath, "/grant:r", $grantTarget) | Out-Null

    $TempArtifacts.Add($tempKeyPath) | Out-Null
    return [string]$tempKeyPath
}

function Invoke-Remote {
    param(
        [Parameter(Mandatory = $true)][string]$ResolvedKeyPath,
        [Parameter(Mandatory = $true)][string]$Command
    )

    Invoke-Checked -FilePath "ssh" -Arguments (@("-i", $ResolvedKeyPath) + $SshOptions + @("$User@$HostName", $Command))
}

Require-Command "npm.cmd"
Require-Command "ssh"
Require-Command "scp"
Require-Command "tar"
Require-Command "icacls"

$ResolvedKeyPath = Resolve-KeyPath -RequestedPath $KeyPath
$SshKeyPath = New-SshKeyTempCopy -SourcePath $ResolvedKeyPath

if (-not $SkipBuild) {
    Write-Host "Building production bundle..."
    Invoke-Checked -FilePath "npm.cmd" -Arguments @("run", "build")
}

if (-not (Test-Path -LiteralPath $DistDir)) {
    throw "Build output not found: $DistDir"
}

$ExpectedAssetPath = $null
$builtIndexHtml = Get-Content -LiteralPath (Join-Path $DistDir "index.html") -Raw
if ($builtIndexHtml -match '(?<asset>/assetmaster/assets/[^"]+\.(js|css))') {
    $ExpectedAssetPath = $Matches.asset
}

$ArchivePath = Join-Path ([System.IO.Path]::GetTempPath()) "$SiteSubdir-$([System.Guid]::NewGuid()).tar.gz"
$TempArtifacts.Add($ArchivePath) | Out-Null

try {
    Write-Host "Creating deployment archive..."
    Invoke-Checked -FilePath "tar" -Arguments @(
        "-czf", $ArchivePath,
        "-C", $DistDir,
        "."
    )

    Write-Host "Preparing remote directories..."
    Invoke-Remote -ResolvedKeyPath $SshKeyPath -Command "sudo mkdir -p $RemoteSiteRoot; rm -rf $RemoteStagingRoot $RemoteArchive; mkdir -p $RemoteStagingRoot"

    Write-Host "Uploading archive to $User@$HostName..."
    Invoke-Checked -FilePath "scp" -Arguments (@("-i", $SshKeyPath) + $SshOptions + @($ArchivePath, "${User}@${HostName}:$RemoteArchive"))

    Write-Host "Extracting archive on host..."
    Invoke-Remote -ResolvedKeyPath $SshKeyPath -Command "tar -xzf $RemoteArchive -C $RemoteStagingRoot && rm -f $RemoteArchive"

    Write-Host "Replacing live site contents at $RemoteSiteRoot..."
    Invoke-Remote -ResolvedKeyPath $SshKeyPath -Command "sudo find $RemoteSiteRoot -mindepth 1 -maxdepth 1 -exec rm -rf {} +; sudo cp -r $RemoteStagingRoot/. $RemoteSiteRoot/; sudo chown -R www-data:www-data $RemoteSiteRoot; sudo find $RemoteSiteRoot -type d -exec chmod 755 {} +; sudo find $RemoteSiteRoot -type f -exec chmod 644 {} +; rm -rf $RemoteStagingRoot"

    if (-not $SkipVerify) {
        Write-Host "Verifying live site..."
        $indexResponse = Invoke-WebRequest -Uri $SiteUrl -UseBasicParsing
        if ($indexResponse.StatusCode -ne 200) {
            throw "$SiteUrl returned HTTP $($indexResponse.StatusCode)"
        }

        if ($ExpectedAssetPath -and $indexResponse.Content -notmatch [Regex]::Escape($ExpectedAssetPath)) {
            throw "Live HTML at $SiteUrl does not reference expected asset $ExpectedAssetPath"
        }

        if ($ExpectedAssetPath) {
            $assetResponse = Invoke-WebRequest -Uri ("https://created.link$ExpectedAssetPath") -Method Head -UseBasicParsing
            if ($assetResponse.StatusCode -ne 200) {
                throw "https://created.link$ExpectedAssetPath returned HTTP $($assetResponse.StatusCode)"
            }
        }

        Write-Host "Verified $SiteUrl" -ForegroundColor Green
        if ($ExpectedAssetPath) {
            Write-Host "Verified deployed asset $ExpectedAssetPath" -ForegroundColor Green
        }
    }

    Write-Host "Deploy complete." -ForegroundColor Green
}
finally {
    foreach ($artifact in $TempArtifacts) {
        if (Test-Path -LiteralPath $artifact) {
            Remove-Item -LiteralPath $artifact -Force -ErrorAction SilentlyContinue
        }
    }
}
