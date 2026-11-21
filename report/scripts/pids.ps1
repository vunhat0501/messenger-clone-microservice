param([string]$svc)
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match "dist.apps.$svc.main" } | ForEach-Object { $_.ProcessId }
