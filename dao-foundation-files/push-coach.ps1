$b64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes('C:\Users\mic\Downloads\pia-system\dao-foundation-files\backend\src\modules\coach.ts'))
$body = @{
    message = "feat: Update Coach AI module with full implementation"
    branch = "main"
    content = $b64
    sha = "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391"
} | ConvertTo-Json
$body | gh api repos/Sodaworld2/DAOV1/contents/backend/src/modules/coach.ts -X PUT --input -
