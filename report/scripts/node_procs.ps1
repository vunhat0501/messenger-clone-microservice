Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'dist.apps.(api|auth-service|chat-service)' -and $_.CommandLine -notmatch 'nest.js|concurrently|nodemon' } |
  ForEach-Object { "$($_.ProcessId)|$([math]::Round($_.WorkingSetSize/1MB,1))|$($_.CommandLine)" }
