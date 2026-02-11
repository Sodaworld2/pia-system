# Claude Code SessionStart Hook - registers with PIA
$input_data = [Console]::In.ReadToEnd()
try {
    $parsed = $input_data | ConvertFrom-Json -ErrorAction SilentlyContinue
    $body = @{
        session_id = if ($parsed.session_id) { $parsed.session_id } else { "unknown" }
        hook_event_name = "SessionStart"
        status = "started"
        message = "Claude Code session started"
    } | ConvertTo-Json
    $headers = @{
        "Content-Type" = "application/json"
        "Authorization" = "Bearer pia-local-dev-token-2024"
    }
    Invoke-RestMethod -Uri "http://localhost:3000/api/hooks/events" -Method POST -Body $body -Headers $headers -TimeoutSec 5 | Out-Null
} catch {
    # Silently fail
}
