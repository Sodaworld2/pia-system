$j = Get-Content 'C:\Users\mic\Downloads\pia-system\dao-src-dump.json' -Raw | ConvertFrom-Json
$j.PSObject.Properties.Name
