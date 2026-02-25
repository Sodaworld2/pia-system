# PIA Email Setup — V1 Activation Guide

**Status:** Code is 100% complete. Two config steps required from Mic to go live.

---

## Step 1 — Email Outbound (V1 criteria 6 & 7)

**What activates:** Eliyahu 6am briefings + Fisher2050 standup/summary emails.

### Get Your SendGrid API Key

Your SodaLabs project already has SendGrid wired (`Downloads/sodalabs/`). Reuse that key or create a new one:

1. Go to [https://app.sendgrid.com/settings/api_keys](https://app.sendgrid.com/settings/api_keys)
2. Create key → name it `PIA Hub` → Full Access → **Copy the key**
3. Add to `.env`:

```bash
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxx
EMAIL_FROM=fisher2050@sodalabs.ai
EMAIL_FROM_NAME=Fisher2050
EMAIL_ELIYAHU=eliyahu@sodalabs.ai
EMAIL_MIC=mic@sodalabs.ai
```

4. Verify your sender in SendGrid:
   - **Settings → Sender Authentication → Single Sender Verification**
   - Add `fisher2050@sodalabs.ai` and `eliyahu@sodalabs.ai` as verified senders
   - (Or do domain authentication for sodalabs.ai — better for deliverability)

5. Restart PM2:
```bash
pm2 restart pia-hub --update-env
```

**Test:** Dashboard → Spawn Fisher2050 → task: "Send me a test standup email to mic@sodalabs.ai"

---

## Step 2 — Email Inbound (V1 criterion 12)

**What activates:** Emails to fisher2050@sodalabs.ai create tasks in the Owl.

### Option A — Cloudflare Email Routing + Tunnel (Recommended — free)

#### 2a. Install Cloudflared (Public Tunnel)

```bash
# Download cloudflared for Windows
winget install --id Cloudflare.cloudflared

# OR manual download:
# https://github.com/cloudflare/cloudflared/releases/latest
# Download cloudflared-windows-amd64.exe → rename to cloudflared.exe → put in C:\Windows\System32\
```

#### 2b. Create a Named Tunnel (one-time setup)

```bash
# Login to Cloudflare (opens browser)
cloudflared tunnel login

# Create the tunnel
cloudflared tunnel create pia-hub

# Note the tunnel ID and credentials file path shown in output
```

#### 2c. Configure the Tunnel

Create `C:\Users\mic\.cloudflared\config.yml`:
```yaml
tunnel: <TUNNEL-ID-FROM-STEP-2b>
credentials-file: C:\Users\mic\.cloudflared\<TUNNEL-ID>.json

ingress:
  - hostname: pia.sodalabs.ai
    service: http://localhost:3000
  - service: http_status:404
```

Add DNS record (Cloudflare dashboard OR CLI):
```bash
cloudflared tunnel route dns pia-hub pia.sodalabs.ai
```

Run as Windows service:
```bash
cloudflared service install
net start cloudflared
```

**Result:** `https://pia.sodalabs.ai` → your PIA server at port 3000.

#### 2d. Cloudflare Email Routing

In Cloudflare Dashboard → sodalabs.ai → **Email Routing**:

1. **Enable Email Routing** for sodalabs.ai
2. Add route:
   - Match: `fisher2050@sodalabs.ai`
   - Action: **Send to Worker**
3. Create a **Cloudflare Worker** (Workers & Pages → Create Worker):

```javascript
export default {
  async email(message, env, ctx) {
    const from = message.from;
    const subject = message.headers.get('subject') || '(no subject)';

    // Read the email body
    const reader = message.raw.getReader();
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const rawEmail = new TextDecoder().decode(
      chunks.reduce((a, b) => {
        const merged = new Uint8Array(a.length + b.length);
        merged.set(a); merged.set(b, a.length);
        return merged;
      })
    );

    // POST to PIA
    await fetch('https://pia.sodalabs.ai/api/email/inbound?token=pia-email-inbound-2024', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        subject,
        body: rawEmail,
        to: 'fisher2050@sodalabs.ai'
      })
    });
  }
};
```

4. Bind the Worker to the email route for `fisher2050@sodalabs.ai`

---

### Option B — Mailgun (Simpler webhook, $35/mo)

1. Sign up at mailgun.com → add sodalabs.ai domain
2. **Receiving → Routes → Create Route**:
   - Expression: `match_recipient("fisher2050@sodalabs.ai")`
   - Action: **Forward** to `https://pia.sodalabs.ai/api/email/inbound?token=pia-email-inbound-2024`
3. Add Mailgun MX records to sodalabs.ai DNS
4. Test by emailing fisher2050@sodalabs.ai

---

## Verification Tests

After setup:

```bash
# Test outbound (sends real email to Mic)
curl -X POST http://localhost:3000/api/email/test \
  -H "Authorization: Bearer pia-local-dev-token-2024" \
  -H "Content-Type: application/json" \
  -d '{"to": "mic@sodalabs.ai", "subject": "PIA Email Test", "body": "Email outbound working."}'

# Test inbound (simulates Fisher2050 receiving an email)
curl -X POST "http://localhost:3000/api/email/inbound?token=pia-email-inbound-2024" \
  -H "Content-Type: application/json" \
  -d '{"from":"mic@sodalabs.ai","subject":"Research Task","body":"Research the top 5 Afrotech investors in 2026","to":"fisher2050@sodalabs.ai"}'

# Verify calendar event was created
sqlite3 data/pia.db "SELECT id, task, status, created_by FROM calendar_events ORDER BY created_at DESC LIMIT 3;"
```

---

## Current State of Email Code

| Component | Status |
|---|---|
| `src/services/email-service.ts` | ✅ Built — SendGrid + dev-mode fallback |
| `src/api/routes/email-inbound.ts` | ✅ Built — parses email, creates calendar_events |
| Email registered in API server | ✅ Wired |
| Eliyahu 6am cron | ✅ Running — sends briefing when SENDGRID_API_KEY set |
| Fisher 9am/6pm crons | ✅ Running — send standup/summary when key set |
| `SENDGRID_API_KEY` | ❌ **Empty — add this first** |
| Public URL (Cloudflare Tunnel) | ❌ **Not configured — optional for inbound only** |

---

## After Email Works — V1 Complete Checklist

- [ ] 1 email received from `eliyahu@sodalabs.ai` by 6:15am next morning
- [ ] 1 standup received from `fisher2050@sodalabs.ai` at 9am
- [ ] Email to `fisher2050@sodalabs.ai` creates a task visible in Mission Control
- [ ] Start 5-day soak test (V1 criterion 17)

**V1 is done when the soak test passes.**
