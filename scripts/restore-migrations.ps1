# Restore missing Supabase migration files from git history.
# Does NOT modify the database or run any Supabase CLI commands.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/restore-migrations.ps1
#
# After running: git add supabase/migrations && git commit -m "restore missing migrations" && git push origin main
# Then: npx supabase db push

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptRoot
Push-Location $projectRoot
try {
    $versions = @(
        "20260221180000",
        "20260221200000",
        "20260222000000",
        "20260222000001",
        "20260222120000",
        "20260222130000",
        "20260222140000"
    )

    $migrationsDir = Join-Path $projectRoot "supabase\migrations"
    foreach ($v in $versions) {
        Write-Host "[RESTORE] $v"

        $localMatch = Get-ChildItem -Path $migrationsDir -Filter "${v}*.sql" -ErrorAction SilentlyContinue
        if ($localMatch) {
            Write-Host "  (skip: already exists locally)"
            continue
        }

        $commitOutput = git rev-list --all -- "supabase/migrations/${v}*.sql" 2>$null
        $commitList = @($commitOutput -split "`n" | Where-Object { $_.Trim() -ne "" })
        $commit = if ($commitList.Count -gt 0) { $commitList[0].Trim() } else { $null }

        if (-not $commit) {
            Write-Host "[MISSING] $v"
            continue
        }
        Write-Host "[FOUND] $commit"

        $pathOutput = git ls-tree -r --name-only $commit -- "supabase/migrations/${v}*.sql" 2>$null
        $pathList = @($pathOutput -split "`n" | Where-Object { $_.Trim() -ne "" })
        $path = if ($pathList.Count -gt 0) { $pathList[0].Trim() } else { $null }

        if (-not $path) {
            Write-Host "[MISSING] $v (no path in tree)"
            continue
        }

        git checkout $commit -- $path
        Write-Host "[RESTORED] $path"
    }
} finally {
    Pop-Location
}

Write-Host "Done. Run: git add supabase/migrations && git commit -m `"restore missing migrations`" && git push origin main"
Write-Host "Then: npx supabase db push"
