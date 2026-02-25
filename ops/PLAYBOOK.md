# PIA Fleet Operations Playbook

> Single source of truth for running and managing the PIA fleet.
> Last updated: 2026-02-22

---

## Fleet Reference

| Machine | Role | Hostname | Tailscale IP | Local User | PIA Path |
|---|---|---|---|---|---|
| **M1** | Hub (controller) | IZZIT7 | 100.73.133.3 | mic | `C:\Users\mic\Downloads\pia-system` |
| **M2** | Worker | SODA-MONSTER-HUNTER | 100.127.165.12 | User | `C:\Users\User\Documents\GitHub\pia-system` |
| **M3** | Worker | SODA-YETI | 100.102.217.69 | mic (confirm) | `C:\Users\mic\Downloads\pia-system` (confirm) |

**M1 SSH key** (already deployed to M2, deploy to M3):
```
ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQDoWDeXtMNXUM0j5T6TLims3FtISCz6qJgmqg7VTboWv5xdDAi7D5QVCvDwThd4JIr9BN2+DdmXQwZyW+I9y8QC97xZZvk9NnTSyfqBXuoKTY9wHqPKHWTxq3tEAWQZ+g9uftk7sStsCszhYwS8OEnFBQE6Z8l5MuXXSgmPWCKCJWd4CAbxuAxvTuNguFVHqbT63Lt4m24yKRuLeR+zqSKeOs5hzsY/1ufKjRWCmKpdtv9cojfSA1HKROPMtNLUdmt/nKVn1KViFD0EkH7tTg6dUeg2Hj2Obp17ZLRF4T/r3d4b68Rlfl+tFq7HbAFGRkaCT9quu/NWLQRYBujfT7q5xnWoQKsT6knz3Uc8uTkoVDKYhLPHB0RexBl48F36+sfeallFYbgs8EWNOlcFgtPucmL+TXZ3PIWIySUcV++iiIwf+SuooOknTPuAPO0QKKzXqmtKKuzAJI+d5ob26na/n9rajvApZcQjnfopS+ykHMRnmiXrYZQNt8ZqV2HiYj2ipyLhJZqgKbl8dtUGhyOK13qxXhv9339S1u51d1FBG+wm3lDFKsZq4YpkfLA397SkMFdSheIv8SEpMVCDH3H1tVo8Oc9RhDg/bJIN9gv1cqB5b35XpHm/9CP1F+Db7eXcsSiF8oNtasFd1RG9F8YvPqw1z0jiIfaFTzzMG4dx1Q== mic@Izzit7
```

---

## Daily Operations

### Check everything is running (from M1)

```bash
# M1 health
curl http://localhost:3000/api/health

# M2 reachable
ping -n 1 100.127.165.12

# M3 reachable
ping -n 1 100.102.217.69

# M1 PM2 status
pm2 status

# M2 PM2 status (via SSH)
ssh user@100.127.165.12 "npx pm2 status"
```

### Restart M1

```bash
cd C:\Users\mic\Downloads\pia-system
pm2 restart ecosystem.config.cjs --update-env
pm2 logs --lines 20
```

### Restart M2 (from M1 via SSH)

```bash
ssh user@100.127.165.12 "cd C:/Users/User/Documents/GitHub/pia-system && npx pm2 restart ecosystem.config.cjs --update-env"
```

### Restart M3 (from M1 via SSH — once SSH is set up)

```bash
ssh mic@100.102.217.69 "cd C:/Users/mic/Downloads/pia-system && npx pm2 restart ecosystem.config.cjs --update-env"
```

---

## Activating a New Machine (the M2 process — repeat for M3)

### Step 1 — Verify Tailscale reachability from M1

```bash
ping -n 3 <machine-tailscale-ip>
```

Must reply. If not: open Tailscale on the target machine and ensure it's signed into the same account.

### Step 2 — Set up SSH key auth (do this once, works forever)

**On M1**, the key is already generated at `~/.ssh/id_rsa.pub`. Run this to see it:
```bash
cat ~/.ssh/id_rsa.pub
```

**On the target machine** (via physical access, RDP, or Gemini/another AI), run in PowerShell:
```powershell
mkdir C:\Users\<username>\.ssh -Force
Add-Content C:\Users\<username>\.ssh\authorized_keys "<paste M1 public key here>"
```

**Test from M1:**
```bash
ssh <username>@<tailscale-ip> "hostname && echo SSH_OK"
```

Should print the machine name and `SSH_OK` with no password prompt.

### Step 3 — Pull latest code

```bash
ssh <username>@<tailscale-ip> "cd <pia-path> && git pull origin master 2>&1"
```

### Step 4 — Install dependencies

```bash
ssh <username>@<tailscale-ip> "cd <pia-path> && npm install 2>&1"
```

### Step 5 — Restart with updated env

```bash
ssh <username>@<tailscale-ip> "cd <pia-path> && npx pm2 restart ecosystem.config.cjs --update-env 2>&1"
```

> **Why `--update-env`?** Without it, PM2 keeps old env vars (like `CLAUDECODE=1`) even after config changes.

### Step 6 — Verify connected to hub

```bash
ssh <username>@<tailscale-ip> "cd <pia-path> && npx pm2 logs pia-hub --lines 10 --nostream 2>&1"
```

Look for: `Connected to Hub` and `Registered as: <machine-name>`

### Step 7 — Open PIA dashboard on the machine's screen

```bash
# Write launcher script
ssh <username>@<tailscale-ip> "powershell -Command \"Set-Content -Path 'C:\\Users\\<username>\\open-pia.ps1' -Value 'Start-Process msedge.exe -ArgumentList http://localhost:3000/mission-control.html'\""

# Create and run scheduled task (runs in interactive session = appears on screen)
ssh <username>@<tailscale-ip> "schtasks /create /tn OpenPIA /tr \"powershell -WindowStyle Hidden -File C:\\Users\\<username>\\open-pia.ps1\" /sc once /st 00:00 /ru <username> /f & schtasks /run /tn OpenPIA"
```

---

## Activating M3 (soda-yeti) — Exact Commands

M3 is already reachable (confirmed ping 2026-02-22). SSH key just needs to be added.

**On M3** (go to soda-yeti or use remote access), run in PowerShell:
```powershell
mkdir C:\Users\mic\.ssh -Force
Add-Content C:\Users\mic\.ssh\authorized_keys "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQDoWDeXtMNXUM0j5T6TLims3FtISCz6qJgmqg7VTboWv5xdDAi7D5QVCvDwThd4JIr9BN2+DdmXQwZyW+I9y8QC97xZZvk9NnTSyfqBXuoKTY9wHqPKHWTxq3tEAWQZ+g9uftk7sStsCszhYwS8OEnFBQE6Z8l5MuXXSgmPWCKCJWd4CAbxuAxvTuNguFVHqbT63Lt4m24yKRuLeR+zqSKeOs5hzsY/1ufKjRWCmKpdtv9cojfSA1HKROPMtNLUdmt/nKVn1KViFD0EkH7tTg6dUeg2Hj2Obp17ZLRF4T/r3d4b68Rlfl+tFq7HbAFGRkaCT9quu/NWLQRYBujfT7q5xnWoQKsT6knz3Uc8uTkoVDKYhLPHB0RexBl48F36+sfeallFYbgs8EWNOlcFgtPucmL+TXZ3PIWIySUcV++iiIwf+SuooOknTPuAPO0QKKzXqmtKKuzAJI+d5ob26na/n9rajvApZcQjnfopS+ykHMRnmiXrYZQNt8ZqV2HiYj2ipyLhJZqgKbl8dtUGhyOK13qxXhv9339S1u51d1FBG+wm3lDFKsZq4YpkfLA397SkMFdSheIv8SEpMVCDH3H1tVo8Oc9RhDg/bJIN9gv1cqB5b35XpHm/9CP1F+Db7eXcsSiF8oNtasFd1RG9F8YvPqw1z0jiIfaFTzzMG4dx1Q== mic@Izzit7"
```

> **Note:** If M3's username is not `mic`, replace both occurrences above.

Then from M1, run these in order:
```bash
# 1. Test SSH
ssh mic@100.102.217.69 "hostname && echo SSH_OK"

# 2. Find PIA path on M3 (check both common locations)
ssh mic@100.102.217.69 "dir C:\\Users\\mic\\Downloads\\pia-system 2>&1 | head -3 || dir C:\\Users\\mic\\Documents\\GitHub\\pia-system 2>&1 | head -3"

# 3. Pull + install + restart (substitute correct path)
ssh mic@100.102.217.69 "cd C:/Users/mic/Downloads/pia-system && git pull origin master && npm install && npx pm2 restart ecosystem.config.cjs --update-env"

# 4. Verify hub connection
ssh mic@100.102.217.69 "cd C:/Users/mic/Downloads/pia-system && npx pm2 logs pia-hub --lines 15 --nostream 2>&1"
```

---

## Remote Control Reference (from M1)

### Send a message popup to a machine's screen

```bash
ssh <user>@<ip> "msg <username> /SERVER:localhost \"Your message here\""
```

### Open a URL in the browser on a machine's screen

```bash
# Write script
ssh <user>@<ip> "powershell -Command \"Set-Content 'C:\\Users\\<user>\\open.ps1' 'Start-Process msedge.exe -ArgumentList <url>'\""
# Run it via scheduled task (interactive session)
ssh <user>@<ip> "schtasks /create /tn OpenURL /tr \"powershell -WindowStyle Hidden -File C:\\Users\\<user>\\open.ps1\" /sc once /st 00:00 /ru <user> /f & schtasks /run /tn OpenURL"
```

### Run a command silently on a remote machine

```bash
ssh <user>@<ip> "powershell -Command \"<your command>\""
```

### Write a file on a remote machine

```bash
ssh <user>@<ip> "powershell -Command \"Set-Content -Path '<path>' -Value '<content>'\""
```

### Check PM2 logs on a remote machine

```bash
ssh <user>@<ip> "cd <pia-path> && npx pm2 logs pia-hub --lines 30 --nostream 2>&1"
```

---

## Troubleshooting

### SSH hangs (waiting for password)
SSH key not installed on target machine. Go to Step 2 of "Activating a New Machine" above.

### PM2 not found on remote machine
Use `npx pm2` instead of `pm2` — it will use the locally installed version.

### Worker won't connect to hub ("Hub connection error: Opening handshake has timed out")
1. Confirm M1 PIA is running: `curl http://localhost:3000/api/health`
2. Confirm Tailscale is active on both machines: `tailscale status`
3. Confirm firewall on M1 allows port 3001 (WebSocket)
4. Restart worker: `npx pm2 restart ecosystem.config.cjs --update-env`

### Agent spawn fails with exit code 1
CLAUDECODE=1 is leaking into PM2. Fix:
```bash
# Confirm it's the issue
ssh <user>@<ip> "cd <pia-path> && npx pm2 env 0 | grep CLAUDECODE"
# Fix: restart with --update-env (ecosystem.config.cjs already has CLAUDECODE: '')
ssh <user>@<ip> "cd <pia-path> && npx pm2 restart ecosystem.config.cjs --update-env"
```

### "tail is not recognized" over SSH
Windows SSH shell doesn't have Unix tools. Replace `tail -n X` with PowerShell:
```bash
ssh <user>@<ip> "powershell -Command \"Get-Content <file> -Tail 20\""
```

### Window/browser won't open via SSH (appears on screen)
SSH runs in Session 0 (isolated). Use the scheduled task method in "Remote Control Reference" above — that runs in the interactive user session.

---

## What NOT to Do

- Don't use `git add -A` when committing — stage specific files
- Don't restart PM2 without `--update-env` — old env vars persist
- Don't use `&&` in PowerShell over SSH — use separate SSH calls or `;` inside PS
- Don't run `npm run dev` manually if PM2 is already managing the process — use `pm2 restart`
- Don't modify `dao-foundation-files/` — separate project, never touch
