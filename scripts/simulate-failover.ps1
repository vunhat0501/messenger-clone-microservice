# simulate-failover.ps1
# End-to-end PostgreSQL failover demo that does not assume which node is the primary.
#
# Each round it finds the current primary, writes a marker row, takes the primary out
# (Mode Stop: docker compose stop; Mode Partition: disconnect it from the network so it
# comes back still writable), waits for the sentinel to promote another node, checks that
# no committed row was lost, brings the old primary back and waits until it has rejoined
# as a streaming standby with exactly one primary left.
#
# Usage (from anywhere):
#   powershell -ExecutionPolicy Bypass -File scripts\simulate-failover.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\simulate-failover.ps1 -Rounds 3
#   powershell -ExecutionPolicy Bypass -File scripts\simulate-failover.ps1 -Mode Partition
#
# It stops and isolates real containers: run it on a development stack only.

param(
    [int]$Rounds = 1,
    [ValidateSet('Stop', 'Partition')][string]$Mode = 'Stop',
    [int]$PromoteTimeoutSec = 90,
    [int]$RejoinTimeoutSec = 180
)

$ErrorActionPreference = 'Continue'
Set-Location (Split-Path $PSScriptRoot -Parent)

$Services = @('postgres_primary', 'postgres_replica', 'postgres_replica_2')
$Failed = $false

# Same credentials docker-compose.yml gives the Postgres containers (DB_USER, DB_NAME in .env).
$DbUser = 'postgres'
$DbName = 'postgres'
if (Test-Path '.env') {
    foreach ($line in Get-Content '.env') {
        if ($line -match '^\s*DB_USER\s*=\s*(.+?)\s*$') { $DbUser = $Matches[1].Trim('"', "'") }
        if ($line -match '^\s*DB_NAME\s*=\s*(.+?)\s*$') { $DbName = $Matches[1].Trim('"', "'") }
    }
}

function Write-Step($Text, $Colour = 'Cyan') {
    Write-Host ''
    Write-Host ('=' * 62) -ForegroundColor $Colour
    Write-Host " $Text" -ForegroundColor $Colour
    Write-Host ('=' * 62) -ForegroundColor $Colour
}

function Invoke-Psql($Service, $Sql) {
    $out = docker compose exec -T $Service psql -U $DbUser -d $DbName -tAc $Sql 2>$null
    if ($LASTEXITCODE -ne 0) { return $null }
    return ($out | Out-String).Trim()
}

# 'f' = read-write primary, 't' = standby, $null = unreachable.
function Get-Roles {
    $roles = @{}
    foreach ($s in $Services) { $roles[$s] = Invoke-Psql $s 'SELECT pg_is_in_recovery();' }
    return $roles
}

# The leading comma keeps a single result an array (PowerShell would unroll it to a string).
function Get-Primaries($Roles) { return , @($Services | Where-Object { $Roles[$_] -eq 'f' }) }

function Show-Roles($Roles) {
    foreach ($s in $Services) {
        $label = switch ($Roles[$s]) { 'f' { 'PRIMARY (read-write)' } 't' { 'standby (read-only)' } default { 'not reachable' } }
        Write-Host ('  {0,-20} {1}' -f $s, $label)
    }
}

function Get-StreamingCount($Primary) {
    $n = Invoke-Psql $Primary "SELECT count(*) FROM pg_stat_replication WHERE state = 'streaming';"
    if ($n -match '^\d+$') { return [int]$n } else { return -1 }
}

function Get-ProbeCount($Service) {
    $n = Invoke-Psql $Service 'SELECT count(*) FROM failover_probe;'
    if ($n -match '^\d+$') { return [int]$n } else { return -1 }
}

# Polls $Check every 2 s until it returns a value other than $null/$false or the time runs out.
function Wait-For([int]$TimeoutSec, [scriptblock]$Check) {
    $sw = [Diagnostics.Stopwatch]::StartNew()
    while ($sw.Elapsed.TotalSeconds -lt $TimeoutSec) {
        $r = & $Check
        if ($r) { return [pscustomobject]@{ Value = $r; Seconds = [math]::Round($sw.Elapsed.TotalSeconds, 1) } }
        Start-Sleep -Seconds 2
    }
    return $null
}

function Get-NetworkInfo($Service) {
    $id = (docker compose ps -q $Service | Out-String).Trim()
    $net = (docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' $id | Out-String).Trim()
    $name = (docker inspect -f '{{.Name}}' $id | Out-String).Trim().TrimStart('/')
    return [pscustomobject]@{ Network = $net; Container = $name }
}

Write-Step "1. INITIAL STATE (database $DbName, user $DbUser)"
$roles = Get-Roles
Show-Roles $roles
$primaries = Get-Primaries $roles
if ($primaries.Count -ne 1) {
    Write-Host "Expected exactly one primary, found $($primaries.Count). Fix the cluster first (docker compose ps)." -ForegroundColor Red
    exit 1
}
if ((Get-StreamingCount $primaries[0]) -ne 2) {
    Write-Host "Expected 2 streaming standbys on $($primaries[0]) before the test." -ForegroundColor Red
    exit 1
}

[void](Invoke-Psql $primaries[0] 'CREATE TABLE IF NOT EXISTS failover_probe (id serial PRIMARY KEY, round int, at timestamptz DEFAULT now());')

for ($round = 1; $round -le $Rounds; $round++) {
    $roles = Get-Roles
    $primaries = Get-Primaries $roles
    if ($primaries.Count -ne 1) {
        Write-Host "Round ${round}: expected one primary, found $($primaries.Count). Stopping." -ForegroundColor Red
        $Failed = $true
        break
    }
    $old = $primaries[0]

    Write-Step "ROUND $round of $Rounds ($Mode): primary is $old" 'Yellow'
    [void](Invoke-Psql $old "INSERT INTO failover_probe (round) VALUES ($round);")
    $before = Get-ProbeCount $old
    Write-Host "Marker rows committed on $old before the failure: $before"

    # ---- take the primary out -------------------------------------------------------------
    $netInfo = $null
    if ($Mode -eq 'Partition') {
        $netInfo = Get-NetworkInfo $old
        Write-Host "Disconnecting $($netInfo.Container) from network $($netInfo.Network) (it keeps running and stays writable)..."
        docker network disconnect $netInfo.Network $netInfo.Container 2>$null | Out-Null
    } else {
        Write-Host "Stopping $old..."
        docker compose stop $old 2>$null | Out-Null
    }
    $failureAt = Get-Date

    # ---- wait for the promotion -----------------------------------------------------------
    $others = @($Services | Where-Object { $_ -ne $old })
    $promoted = Wait-For $PromoteTimeoutSec {
        $p = @($others | Where-Object { (Invoke-Psql $_ 'SELECT pg_is_in_recovery();') -eq 'f' })
        if ($p.Count -eq 1) { return $p[0] } else { return $null }
    }
    if (-not $promoted) {
        Write-Host "FAILED: no new primary within $PromoteTimeoutSec s." -ForegroundColor Red
        docker compose logs postgres_sentinel --tail 15
        $Failed = $true
        break
    }
    $new = $promoted.Value
    Write-Host "New primary: $new (promoted $([math]::Round(((Get-Date) - $failureAt).TotalSeconds, 1)) s after the failure)" -ForegroundColor Green

    Write-Host "`nSentinel log:"
    $since = [int]((Get-Date) - $failureAt).TotalSeconds + 5
    docker compose logs postgres_sentinel --since "${since}s" 2>$null | Where-Object { $_ -notmatch 'No reachable primary' }

    # ---- data survived and new primary takes writes ---------------------------------------
    $after = Get-ProbeCount $new
    if ($after -eq $before) {
        Write-Host "No data lost: $after of $before marker rows present on $new." -ForegroundColor Green
    } else {
        Write-Host "DATA LOST: $after of $before marker rows present on $new." -ForegroundColor Red
        $Failed = $true
    }
    [void](Invoke-Psql $new "INSERT INTO failover_probe (round) VALUES ($round);")
    $expected = $before + 1

    # ---- bring the old primary back -------------------------------------------------------
    $dualSeen = $false
    if ($Mode -eq 'Partition') {
        Write-Host "`nReconnecting $($netInfo.Container) (it still believes it is the primary)..."
        docker network connect --alias $old --alias $netInfo.Container $netInfo.Network $netInfo.Container 2>$null | Out-Null
    } else {
        Write-Host "`nStarting $old again..."
        docker compose start $old 2>$null | Out-Null
    }

    $rejoined = Wait-For $RejoinTimeoutSec {
        $r = Get-Roles
        if ((Get-Primaries $r).Count -gt 1) { $script:dualSeen = $true }
        if ($r[$old] -eq 't' -and (Get-Primaries $r).Count -eq 1 -and (Get-StreamingCount $new) -eq 2) { return $true } else { return $null }
    }
    if ($Mode -eq 'Partition') {
        if ($dualSeen) { Write-Host 'Two writable primaries were seen; the sentinel fenced the stale one.' -ForegroundColor Yellow }
        else { Write-Host 'No second writable primary was observed.' }
    }
    if (-not $rejoined) {
        Write-Host "FAILED: $old did not rejoin as a streaming standby within $RejoinTimeoutSec s." -ForegroundColor Red
        Show-Roles (Get-Roles)
        $Failed = $true
        break
    }
    Write-Host "$old rejoined as a standby in $($rejoined.Seconds) s; $new has 2 streaming standbys." -ForegroundColor Green

    # ---- all nodes hold the same data -----------------------------------------------------
    $same = Wait-For 30 {
        $counts = @($Services | ForEach-Object { Get-ProbeCount $_ })
        if (($counts | Where-Object { $_ -ne $expected }).Count -eq 0) { return $true } else { return $null }
    }
    if ($same) { Write-Host "All three nodes hold $expected marker rows." -ForegroundColor Green }
    else {
        Write-Host "FAILED: nodes disagree on the marker rows (expected $expected on every node)." -ForegroundColor Red
        $Failed = $true
    }
    Start-Sleep -Seconds 5
}

Write-Step 'FINAL STATE'
$roles = Get-Roles
Show-Roles $roles
$primaries = Get-Primaries $roles
if ($primaries.Count -eq 1) {
    [void](Invoke-Psql $primaries[0] 'DROP TABLE IF EXISTS failover_probe;')
} else {
    $Failed = $true
}

Write-Host ''
if ($Failed) {
    Write-Host 'RESULT: FAILED' -ForegroundColor Red
    exit 1
}
Write-Host 'RESULT: PASSED' -ForegroundColor Green
