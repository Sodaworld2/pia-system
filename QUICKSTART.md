# PIA Quick Reference

## Start Server
```
Double-click START.bat
   - OR -
cd C:\Users\mic\Downloads\pia-system
npm start
```

## Dashboard
```
http://localhost:3000
```

## Menu
- **Fleet Matrix** - See all AI agents
- **CLI Tunnel** - Remote terminal control
- **Alerts** - Problems & notifications

## CLI Tunnel Steps
1. Click "CLI Tunnel"
2. Click "New Session"
3. Select session from dropdown
4. Type in terminal

## API Token
```
dev-token-change-in-production
```

## Key Files
| File | Purpose |
|------|---------|
| `START.bat` | Double-click to start |
| `USAGE.md` | Full documentation |
| `README.md` | Technical overview |
| `data/pia.db` | Database |

## Remote Access
```bash
# Quick tunnel (install ngrok first)
ngrok http 3000
```

## Stop Server
Press `Ctrl+C` in terminal

---
*PIA = Project Intelligence Agent*
