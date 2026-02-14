$j = Get-Content 'C:\Users\mic\Downloads\pia-system\Martin\claude-orchestration-template-main\UsersmicDownloadspia-systemdao-src-dump.json' -Raw | ConvertFrom-Json
$j.'backend/src/database.ts' | Out-File -FilePath 'C:\Users\mic\Downloads\pia-system\_extracted_database.ts' -Encoding UTF8
$j.'backend/src/routes/council.ts' | Out-File -FilePath 'C:\Users\mic\Downloads\pia-system\_extracted_council.ts' -Encoding UTF8
$j.'backend/src/routes/tokens.ts' | Out-File -FilePath 'C:\Users\mic\Downloads\pia-system\_extracted_tokens.ts' -Encoding UTF8
$j.'backend/src/routes/treasury.ts' | Out-File -FilePath 'C:\Users\mic\Downloads\pia-system\_extracted_treasury.ts' -Encoding UTF8
$j.'backend/src/routes/marketplace.ts' | Out-File -FilePath 'C:\Users\mic\Downloads\pia-system\_extracted_marketplace.ts' -Encoding UTF8
$j.'backend/src/routes/signatures.ts' | Out-File -FilePath 'C:\Users\mic\Downloads\pia-system\_extracted_signatures.ts' -Encoding UTF8
$j.'backend/src/routes/contracts.ts' | Out-File -FilePath 'C:\Users\mic\Downloads\pia-system\_extracted_contracts.ts' -Encoding UTF8
$j.'backend/src/routes/milestones.ts' | Out-File -FilePath 'C:\Users\mic\Downloads\pia-system\_extracted_milestones.ts' -Encoding UTF8
$j.'backend/src/routes/founder-agreements.ts' | Out-File -FilePath 'C:\Users\mic\Downloads\pia-system\_extracted_founder_agreements.ts' -Encoding UTF8
Write-Output "Done extracting all files"
