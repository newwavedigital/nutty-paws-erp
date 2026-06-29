param(
    [string]$DatabaseName = "nut-house-portal-staging-db",
    [string]$PersistTo = "",
    [string]$ExportPath = ".wrangler/dev-staging-export.sql",
    [int]$Port = 8787,
    [switch]$NoRefreshStagingData,
    [switch]$NoMigrations,
    [switch]$KeepExport
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

function Invoke-Npx {
    param([Parameter(Mandatory = $true)][string[]]$NpxArguments)

    & npx.cmd @NpxArguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed: npx.cmd $($NpxArguments -join ' ')"
    }
}

function Ensure-ParentDirectory {
    param([Parameter(Mandatory = $true)][string]$Path)

    $parent = Split-Path -Parent $Path
    if ($parent -and -not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Path $parent | Out-Null
    }
}

function Invoke-LocalMigrations {
    param(
        [Parameter(Mandatory = $true)][string]$Database,
        [Parameter(Mandatory = $true)][string]$PersistPath
    )

    $migrationArgs = @(
        "wrangler",
        "d1",
        "migrations",
        "apply",
        $Database,
        "--local",
        "--persist-to",
        $PersistPath
    )

    $previousCi = $env:CI
    $env:CI = "1"
    try {
        Invoke-Npx -NpxArguments $migrationArgs
    }
    finally {
        $env:CI = $previousCi
    }
}

$defaultPersistTo = Join-Path $env:TEMP "nut-house-portal-dev-staging-data"
if ([string]::IsNullOrWhiteSpace($PersistTo)) {
    $resolvedPersistTo = $defaultPersistTo
}
elseif ([System.IO.Path]::IsPathRooted($PersistTo)) {
    $resolvedPersistTo = $PersistTo
}
else {
    $resolvedPersistTo = Join-Path $repoRoot $PersistTo
}
$resolvedExportPath = Join-Path $repoRoot $ExportPath
$currentSnapshotFile = Join-Path $resolvedPersistTo "current-snapshot.txt"
$activePersistTo = $resolvedPersistTo

Write-Host "Nut House local dev launcher"
Write-Host "Repo: $repoRoot"
Write-Host "Local D1 persist base: $resolvedPersistTo"

if (-not $NoRefreshStagingData) {
    Write-Host "Exporting remote staging D1 data from '$DatabaseName'..."
    Ensure-ParentDirectory -Path $resolvedExportPath
    $exportArgs = @(
        "wrangler",
        "d1",
        "export",
        $DatabaseName,
        "--remote",
        "--skip-confirmation",
        "--no-schema",
        "--output",
        $resolvedExportPath
    )
    Invoke-Npx -NpxArguments $exportArgs

    $filteredExportPath = $null
    try {
        $snapshotName = Get-Date -Format "yyyyMMdd-HHmmss"
        $activePersistTo = Join-Path $resolvedPersistTo "snapshots/$snapshotName"
        New-Item -ItemType Directory -Path $activePersistTo -Force | Out-Null

        Write-Host "Applying local D1 migrations to snapshot: $activePersistTo"
        Invoke-LocalMigrations -Database $DatabaseName -PersistPath $activePersistTo

        $filteredExportPath = Join-Path (Split-Path -Parent $resolvedExportPath) "dev-staging-export-data.sql"
        Get-Content -Path $resolvedExportPath |
            Where-Object { $_ -notmatch '^INSERT INTO "d1_migrations"' } |
            Set-Content -Path $filteredExportPath -Encoding utf8

        Write-Host "Importing staging D1 export into local Wrangler snapshot: $activePersistTo"
        $importArgs = @(
            "wrangler",
            "d1",
            "execute",
            $DatabaseName,
            "--local",
            "--persist-to",
            $activePersistTo,
            "--file",
            $filteredExportPath,
            "--yes"
        )
        Invoke-Npx -NpxArguments $importArgs
        Ensure-ParentDirectory -Path $currentSnapshotFile
        Set-Content -Path $currentSnapshotFile -Value $activePersistTo -Encoding utf8
    }
    finally {
        if (-not $KeepExport -and (Test-Path -LiteralPath $resolvedExportPath)) {
            Remove-Item -LiteralPath $resolvedExportPath -Force
        }
        if (-not $KeepExport -and ($null -ne $filteredExportPath) -and (Test-Path -LiteralPath $filteredExportPath)) {
            Remove-Item -LiteralPath $filteredExportPath -Force
        }
    }
}
elseif (-not $NoMigrations) {
    if (Test-Path -LiteralPath $currentSnapshotFile) {
        $recordedSnapshot = (Get-Content -Raw -Path $currentSnapshotFile).Trim()
        if ($recordedSnapshot -and (Test-Path -LiteralPath $recordedSnapshot)) {
            $activePersistTo = $recordedSnapshot
        }
    }

    Write-Host "Skipping remote staging refresh; applying local migrations to snapshot: $activePersistTo"
    Invoke-LocalMigrations -Database $DatabaseName -PersistPath $activePersistTo
}
else {
    if (Test-Path -LiteralPath $currentSnapshotFile) {
        $recordedSnapshot = (Get-Content -Raw -Path $currentSnapshotFile).Trim()
        if ($recordedSnapshot -and (Test-Path -LiteralPath $recordedSnapshot)) {
            $activePersistTo = $recordedSnapshot
        }
    }

    Write-Host "Skipping remote staging refresh and local migrations."
}

Write-Host "Using local D1 persist directory: $activePersistTo"
Write-Host "Starting Wrangler dev on http://localhost:$Port ..."
$devArgs = @(
    "wrangler",
    "dev",
    "--local",
    "--persist-to",
    $activePersistTo,
    "--port",
    "$Port"
)
Invoke-Npx -NpxArguments $devArgs
