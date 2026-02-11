# Claude Code PreToolUse Hook - logs and optionally blocks dangerous commands
$input_data = [Console]::In.ReadToEnd()
try {
    $parsed = $input_data | ConvertFrom-Json -ErrorAction SilentlyContinue

    # Check for dangerous commands
    if ($parsed.tool_name -eq "Bash" -and $parsed.tool_input.command) {
        $cmd = $parsed.tool_input.command
        $dangerous = @("rm -rf /", "format ", "del /s /q C:", "Remove-Item -Recurse -Force C:")
        foreach ($pattern in $dangerous) {
            if ($cmd -like "*$pattern*") {
                # Block dangerous command
                $result = @{
                    hookSpecificOutput = @{
                        hookEventName = "PreToolUse"
                        permissionDecision = "deny"
                        permissionDecisionReason = "PIA Safety: Blocked dangerous command pattern: $pattern"
                    }
                } | ConvertTo-Json -Depth 3
                Write-Output $result

                # Also notify PIA
                $body = @{
                    session_id = if ($parsed.session_id) { $parsed.session_id } else { "unknown" }
                    hook_event_name = "PreToolUse"
                    tool_name = $parsed.tool_name
                    status = "blocked"
                    message = "Blocked dangerous command: $cmd"
                } | ConvertTo-Json
                $headers = @{
                    "Content-Type" = "application/json"
                    "Authorization" = "Bearer pia-local-dev-token-2024"
                }
                Invoke-RestMethod -Uri "http://localhost:3000/api/hooks/events" -Method POST -Body $body -Headers $headers -TimeoutSec 5 | Out-Null
                exit 2
            }
        }
    }

    # Log the tool use to PIA (async, don't block)
    $body = @{
        session_id = if ($parsed.session_id) { $parsed.session_id } else { "unknown" }
        hook_event_name = "PreToolUse"
        tool_name = $parsed.tool_name
        tool_input = $parsed.tool_input
        status = "allowed"
    } | ConvertTo-Json -Depth 3
    $headers = @{
        "Content-Type" = "application/json"
        "Authorization" = "Bearer pia-local-dev-token-2024"
    }
    Invoke-RestMethod -Uri "http://localhost:3000/api/hooks/events" -Method POST -Body $body -Headers $headers -TimeoutSec 5 | Out-Null
} catch {
    # Silently fail - never block Claude on hook errors
}
