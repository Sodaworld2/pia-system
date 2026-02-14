$j = Get-Content 'C:\Users\mic\Downloads\pia-system\Martin\claude-orchestration-template-main\UsersmicDownloadspia-systemdao-src-dump.json' -Raw | ConvertFrom-Json
Write-Output "=== backend/src/database.ts ==="
Write-Output $j.'backend/src/database.ts'
