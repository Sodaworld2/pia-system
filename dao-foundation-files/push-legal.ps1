$b64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes('C:\Users\mic\Downloads\pia-system\dao-foundation-files\backend\src\modules\legal.ts'))
$body = @{
    message = "feat: Add Legal AI module - contracts, compliance, clause library and agreement lifecycle"
    branch = "main"
    content = $b64
} | ConvertTo-Json
$body | gh api repos/Sodaworld2/DAOV1/contents/backend/src/modules/legal.ts -X PUT --input -
