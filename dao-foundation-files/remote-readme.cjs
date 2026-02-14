const fs = require('fs');

const readme = `# PIA Remote Orchestration — Machine Control Protocol

## CRITICAL RULE: Always Build on the Target Machine

When using PIA to manage remote machines, **ALL work must happen on the remote machine**
through the PTY (terminal) session. The orchestrating agent (Machine #1 / hub) should
NEVER write files locally and push them through an intermediary like GitHub.

### The Correct Pattern

\`\`\`
Machine #1 (Hub)                    Machine #3 (Target)
┌─────────────┐                     ┌─────────────────┐
│ Claude Agent │──── PTY Session ───>│ PowerShell/Bash  │
│ (orchestrator)│     (commands)     │ (real terminal)  │
└─────────────┘                     │                  │
                                    │  Write files     │
                                    │  Edit code       │
                                    │  Build (tsc)     │
                                    │  Run tests       │
                                    │  Start server    │
                                    └─────────────────┘
\`\`\`

### How It Works

1. **Create a PTY session** on the target machine:
   \`\`\`
   POST http://<machine-ip>:3000/api/sessions
   Body: { "machine_id": "<db-id>", "shell": "powershell" }
   \`\`\`

2. **Send commands** through the PTY session:
   \`\`\`
   POST http://<machine-ip>:3000/api/sessions/<session-id>/input
   Body: { "data": "cd /path/to/project\\r\\n" }
   \`\`\`

3. **Read output** from the PTY buffer:
   \`\`\`
   GET http://<machine-ip>:3000/api/sessions/<session-id>
   → response.buffer contains terminal output
   \`\`\`

### Writing Files on Remote Machines

Since complex scripts are hard to type through PTY due to JSON escaping,
use the **base64 decode pattern**:

1. Encode your script/file content as base64
2. Send it to the remote machine via PTY:
   \`\`\`
   node -e "require('fs').writeFileSync('myfile.ts', Buffer.from('<base64>','base64').toString('utf8'))"
   \`\`\`
3. Run the script on the remote machine:
   \`\`\`
   node myfile.cjs
   \`\`\`

### Why NOT to Use GitHub as Intermediary

❌ **Wrong pattern**: Write locally → Push to GitHub → Pull on target → Build
✅ **Correct pattern**: Open PTY on target → Write directly on target → Build on target

The GitHub intermediary pattern:
- Adds unnecessary round-trips
- Creates noise commits in the repo
- Doesn't demonstrate PIA's remote control capabilities
- Defeats the purpose of the orchestration system

### PTY Escaping Tips

- Use \`\\r\\n\` for Enter (not just \`\\n\`)
- Use \`\\u0024\` for \`$\` in PowerShell env vars (e.g., \`\\u0024env:VAR='value'\`)
- For complex scripts, always use the base64 decode pattern
- For simple commands, send one at a time with proper \`\\r\\n\`
- Check the PTY buffer after each command to verify output
- PowerShell uses \`;\` not \`&&\` for command chaining

### Multiple Sessions

You can run multiple PTY sessions on the same machine:
- Session 1: Running the server (long-lived)
- Session 2: Running builds and tests
- Session 3: Editing files

### Machine Fleet

| Machine | Role | Tailscale IP |
|---------|------|-------------|
| Machine #1 (izzit7) | Hub / Orchestrator | 100.73.133.3 |
| Machine #3 (soda-yeti) | Build Target | 100.102.217.69 |

All machines run PIA on port 3000 for the relay/session API.
`;

fs.writeFileSync('REMOTE_ORCHESTRATION.md', readme);
console.log('README written: REMOTE_ORCHESTRATION.md');
