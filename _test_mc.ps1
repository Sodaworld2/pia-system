$headers = @{
    "x-api-token" = "pia-local-dev-token-2024"
    "Content-Type" = "application/json"
}
$authOnly = @{ "x-api-token" = "pia-local-dev-token-2024" }

Start-Sleep -Seconds 5

# Spawn agent
Write-Host "=== SPAWNING AGENT ==="
$body = @{
    mode = "api"
    task = "List the TypeScript files in src/mission-control/ and tell me what each one does in one sentence"
    cwd = "C:\Users\mic\Downloads\pia-system"
    approvalMode = "auto"
    maxBudget = 0.50
} | ConvertTo-Json

$result = Invoke-RestMethod -Uri "http://localhost:3000/api/mc/agents" -Method POST -Headers $headers -Body $body
Write-Host ($result | ConvertTo-Json)
$agentId = $result.id
Write-Host "Agent ID: $agentId"

# Wait for task
Write-Host "`n=== WAITING 20s FOR TASK ==="
Start-Sleep -Seconds 20

# Check status
Write-Host "`n=== AGENT STATUS ==="
$agent = Invoke-RestMethod -Uri "http://localhost:3000/api/mc/agents/$agentId" -Headers $authOnly
Write-Host "Status: $($agent.agent.status)"
Write-Host "Cost: `$$($agent.agent.cost)"
Write-Host "Tool Calls: $($agent.agent.toolCalls)"
if ($agent.agent.errorMessage) { Write-Host "Error: $($agent.agent.errorMessage)" }

# Journal
Write-Host "`n=== JOURNAL ==="
$journal = Invoke-RestMethod -Uri "http://localhost:3000/api/mc/agents/$agentId/journal" -Headers $authOnly
foreach ($entry in $journal.journal) {
    $content = $entry.content
    if ($content.Length -gt 300) { $content = $content.Substring(0, 300) + "..." }
    Write-Host "[$($entry.type)] $content"
}

# Output buffer
Write-Host "`n=== OUTPUT (last 1000 chars) ==="
if ($agent.buffer -and $agent.buffer.Length -gt 0) {
    $start = [Math]::Max(0, $agent.buffer.Length - 1000)
    Write-Host $agent.buffer.Substring($start)
} else {
    Write-Host "(empty)"
}
