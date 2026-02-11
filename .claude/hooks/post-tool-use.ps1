# Claude Code PostToolUse Hook - sends event to PIA
# Reads JSON from stdin, forwards to PIA API
$input_data = [Console]::In.ReadToEnd()
try {
    $headers = @{
        "Content-Type" = "application/json"
        "Authorization" = "Bearer pia-local-dev-token-2024"
    }
    Invoke-RestMethod -Uri "http://localhost:3000/api/hooks/events" -Method POST -Body $input_data -Headers $headers -TimeoutSec 5 | Out-Null
} catch {
    # Silently fail - don't block Claude
}
