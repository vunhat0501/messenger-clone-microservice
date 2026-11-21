# simulate-failover.ps1
# End-to-end automated simulation of primary crash and replica promotion

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " 1. CHECK INITIAL POSTGRESQL CLUSTER RECOVERY STATUS" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$primaryRecovery = docker compose exec -T postgres_primary psql -U postgres -d postgres -tAc "SELECT pg_is_in_recovery();"
$r1Recovery = docker compose exec -T postgres_replica psql -U postgres -d postgres -tAc "SELECT pg_is_in_recovery();"
$r2Recovery = docker compose exec -T postgres_replica_2 psql -U postgres -d postgres -tAc "SELECT pg_is_in_recovery();"

Write-Host "postgres_primary    pg_is_in_recovery: $primaryRecovery (Expected: f)"
Write-Host "postgres_replica    pg_is_in_recovery: $r1Recovery (Expected: t)"
Write-Host "postgres_replica_2  pg_is_in_recovery: $r2Recovery (Expected: t)"

Write-Host "`n==========================================================" -ForegroundColor Yellow
Write-Host " 2. SIMULATING PRIMARY NODE CRASH: Stopping postgres_primary..." -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Yellow
docker compose stop postgres_primary

Write-Host "`nWaiting 18 seconds for postgres_sentinel to detect failure (3 probes @ 5s) and promote standby..." -ForegroundColor Yellow
Start-Sleep -Seconds 18

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host " 3. CHECKING SENTINEL PROMOTION LOGS" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
docker compose logs postgres_sentinel --tail 15

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host " 4. VERIFYING REPLICA 1 HAS BEEN PROMOTED TO PRIMARY" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
$newPrimaryRecovery = docker compose exec -T postgres_replica psql -U postgres -d postgres -tAc "SELECT pg_is_in_recovery();"
Write-Host "postgres_replica pg_is_in_recovery: $newPrimaryRecovery"

if ($newPrimaryRecovery.Trim() -eq "f") {
    Write-Host "SUCCESS: postgres_replica was successfully promoted to PRIMARY!" -ForegroundColor Green
    Write-Host "`nTesting write query on newly promoted primary..." -ForegroundColor Green
    docker compose exec -T postgres_replica psql -U postgres -d postgres -c "CREATE TABLE IF NOT EXISTS test_promotion (id serial, msg text, ts timestamp default now()); INSERT INTO test_promotion (msg) VALUES ('failover verified'); SELECT * FROM test_promotion;"
} else {
    Write-Host "FAILED: postgres_replica is still in recovery!" -ForegroundColor Red
}

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host " SIMULATION COMPLETE" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
