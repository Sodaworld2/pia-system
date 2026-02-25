# Cloudflare — PIA System Integration Knowledge Base

> **Researched:** 2026-02-22
> **Context:** PIA multi-machine agent orchestration system (Express + TypeScript + SQLite + Claude Agent SDK)
> **Machines:** M1 Hub (Izzit7), M2 (soda-monster-hunter), M3 (SODA-YETI) — connected via Tailscale
> **Company:** SodaLabs / Soda World, Johannesburg

---

## Executive Summary

1. **Cloudflare AI Gateway is the single highest-ROI integration for PIA right now.** It is free, requires one URL change in agent-session.ts, and immediately gives you: request logging for every Claude call across all 12 agents, response caching (cache hits = zero Anthropic cost), rate limiting per agent, and automatic fallback to alternate models if Claude is unavailable — all without touching the SDK spawn logic.

2. **Cloudflare Tunnel replaces the need to open router ports and complements (not replaces) Tailscale.** Use Tailscale for private machine-to-machine traffic (M1↔M2↔M3) and Cloudflare Tunnel for public-facing surfaces (mission-control dashboard, agent webhook receivers, GumballCMS inbound). Free forever, no bandwidth limits, works behind CGNAT.

3. **Cloudflare Email Routing solves the sodalabs.ai agent email addresses for free — inbound only.** fisher2050@sodalabs.ai, eliyahu@sodalabs.ai, etc. can all route to real inboxes at zero cost. For outbound (agents sending emails), you still need Resend/SendGrid, which you already have in the sodalabs codebase.

---

## Product-by-Product Breakdown

| Product | What It Does | Free Tier | Paid Tier | PIA Relevance (1-5) |
|---|---|---|---|---|
| **Cloudflare Tunnel** | Exposes localhost services to internet via outbound tunnel — no port forwarding, no public IP needed | Free forever, unlimited bandwidth | Included in Zero Trust paid plans | **5** — Expose mission-control.html and webhook endpoints publicly |
| **Cloudflare AI Gateway** | Proxy layer for all AI provider calls — logging, caching, rate limiting, fallback, cost tracking | Free (core features); logging via Workers pricing ($5/mo for 10M requests) | Same plus extended log retention | **5** — Direct integration with ANTHROPIC_API_KEY calls in agent-session.ts |
| **Cloudflare Email Routing** | Route inbound mail from custom domain to any inbox — up to 200 rules | 100% free, unlimited addresses | N/A (it's free) | **5** — fisher2050@sodalabs.ai, eliyahu@sodalabs.ai etc. → real inboxes |
| **Cloudflare Zero Trust / Access** | Put authentication in front of any URL — dashboard, admin routes, agent API | Free up to 50 users | $7/user/month | **4** — Lock mission-control.html behind Google/email login without touching Express code |
| **Cloudflare R2** | S3-compatible object storage, zero egress fees | 10 GB/month storage, 1M Class A ops/month, 10M Class B ops/month | $0.015/GB, $4.50/M Class A ops | **4** — Store agent session recordings, Tim Buc archives, Videohoho exported videos |
| **Cloudflare Pages** | Static site hosting, CDN, unlimited bandwidth | Unlimited requests + bandwidth free | Same + advanced features | **3** — Host sodalabs.ai marketing site, Farcake2025 frontend, pia-book.html |
| **Cloudflare Workers** | Edge serverless functions, runs JS/TS at 300+ PoPs | 100,000 req/day free | $5/month for 10M req/month | **3** — Webhook receivers, agent status aggregator, lightweight API edge |
| **Cloudflare D1** | Edge SQLite database (managed, replicated) | Included in Workers free/paid | Based on rows read/written | **2** — Not a replacement for PIA's local SQLite; useful for edge-specific data only |
| **Cloudflare Workers KV** | Distributed key-value store | 100K reads/day, 1K writes/day, 1 GB storage | $5/month for higher limits | **2** — Agent state caching at edge; low write volume fits free tier |
| **Cloudflare Queues** | Managed message queue, guaranteed delivery | Free since Feb 2026: 10K ops/day, up to 10K queues | $5/month for 1M ops/month | **2** — Alternative to PIA's SQLite jobs table; Fisher2050 → agent job queue |
| **Cloudflare Durable Objects** | Stateful edge workers, each with its own SQLite | Free (SQLite backend only) up to 5 GB | $5/month (KV backend available) | **2** — Real-time agent presence, WebSocket state at edge |
| **Cloudflare Workers AI** | Run open-source models (Llama, Mistral, Stable Diffusion) at edge | Included with Workers | $0.011 per 1,000 Neurons | **1** — Supplement Claude for cheap/fast tasks; not a Claude replacement |

---

## Deep Dive 1: Cloudflare AI Gateway

### What It Is

A transparent proxy that sits between your application and AI providers (Anthropic, OpenAI, Google, Groq, xAI, Workers AI, HuggingFace — 350+ models). You change one URL in your code; everything else is handled at the Cloudflare layer.

For PIA, the relevant change is in `src/mission-control/agent-session.ts` where the Anthropic SDK is initialised. Instead of calling `https://api.anthropic.com` directly, you route through your AI Gateway endpoint.

### How It Works for PIA

```typescript
// BEFORE (current PIA code)
import Anthropic from '@anthropic-ai/sdk';
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// AFTER (with AI Gateway — one line change)
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: 'https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_name}/anthropic'
});
```

That single URL change gives you everything below.

### Feature Breakdown

**1. Request Logging (Observability)**
- Every prompt, every response, token counts, latency, cost estimate — all logged
- Dashboard shows per-agent, per-model, per-session breakdowns
- 24-hour log retention on free tier (request bodies stored in R2); longer with paid
- OpenTelemetry (OTEL) export supported — pipe to your own observability stack
- Critical for PIA: see exactly what Fisher2050, Eliyahu, Tim Buc are doing and spending

**2. Caching**
- Exact-match caching: identical prompts return cached responses instantly (zero API cost)
- Semantic caching: on the roadmap (not yet live as of early 2026)
- PIA benefit: Eliyahu's morning briefing template, Fisher2050 standup generation — these have repetitive prompt structures. Cache hit rate of even 10% is real money saved.
- Cache TTL is configurable per gateway

**3. Rate Limiting**
- Set per-model or per-gateway limits: X requests per minute/hour/day
- Use case: prevent a runaway agent (Fisher2050 cron gone wrong, loop bug) from burning your entire Anthropic budget in one session
- Can return custom error messages when rate limit hit

**4. Model Fallback + Retries**
- Define a fallback chain: Claude Sonnet → Claude Haiku → Groq Llama → Workers AI Llama
- If Anthropic returns an error, the gateway automatically retries up to 5 times, then falls back to next provider
- PIA benefit: 24/7 autonomous agents need resilience; if Anthropic has an outage, agents keep running on a fallback model

**5. Content Moderation (Guardrails)**
- Built-in Llama Guard integration for harmful content detection
- PII detection via Named Entity Recognition (Presidio framework) — blocks credit cards, phone numbers, names from being sent to external APIs
- Firewall for AI: block prompt injection, jailbreak attempts before they reach Claude
- PIA benefit: if Mic's personal data (from DAOV1 or SodaWorld) ever passes through an agent prompt, PII scrubbing protects it

**6. Universal Endpoint (Multi-Provider Routing)**
- Single endpoint that can route to any supported provider
- Dynamic routing: send different requests to different models based on rules
- Fast tasks → Workers AI (free). Complex tasks → Claude Sonnet. Cheap summaries → Claude Haiku.

### Pricing

| Tier | Cost | What You Get |
|---|---|---|
| Free | $0 | All core features: logging dashboard, caching, rate limiting, fallbacks, content moderation |
| Logging (Workers pricing) | $5/month for 10M requests | Extended log storage and export |
| Anthropic API | Unchanged | You still pay Anthropic directly — the gateway does not change token costs |

**Bottom line for PIA:** AI Gateway core features are genuinely free. The only cost is if you need extended log retention beyond 24 hours. Given PIA's 12 agents + 5 cron jobs, the observability alone is worth it.

---

## Deep Dive 2: Cloudflare Tunnel

### What It Is

A lightweight daemon (`cloudflared`) that runs on your machine, creates outbound-only encrypted connections to Cloudflare's network, and allows Cloudflare to proxy inbound HTTP/S traffic to your localhost. No port forwarding, no router config, no public IP required. Works behind CGNAT (common with South African ISPs).

### How It Works

```
Internet user → Cloudflare Edge → encrypted tunnel (outbound from your machine) → cloudflared → localhost:3000
```

The tunnel is initiated by your machine. Your router never needs an inbound rule. Cloudflare terminates HTTPS with a valid cert.

### Setup for PIA

```bash
# Install cloudflared (one time)
# Linux:
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
chmod +x cloudflared && sudo mv cloudflared /usr/local/bin/

# Windows (M1 Izzit7):
winget install Cloudflare.cloudflared

# Authenticate
cloudflared tunnel login

# Create named tunnel
cloudflared tunnel create pia-hub

# Configure (config.yml)
tunnel: <tunnel-uuid>
credentials-file: /home/mic/.cloudflared/<uuid>.json
ingress:
  - hostname: pia.sodalabs.ai
    service: http://localhost:3000
  - service: http_status:404

# Run as persistent service (Linux)
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared

# Run as persistent service (Windows — runs via sc.exe)
cloudflared service install
```

### Cloudflare Tunnel vs Tailscale — When to Use Each

| Criterion | Cloudflare Tunnel | Tailscale |
|---|---|---|
| **Purpose** | Expose services to the PUBLIC internet | Private machine-to-machine mesh |
| **Authentication** | Cloudflare Access (ZT) layer, or public | WireGuard encrypted, device-authenticated |
| **Performance** | Routes via Cloudflare PoP (slight latency) | WireGuard P2P — near-LAN speeds |
| **Behind CGNAT** | Yes — works perfectly | Yes — DERP relays handle it |
| **Traffic visibility** | Cloudflare can see unencrypted content at their edge | End-to-end encrypted, Tailscale cannot see data |
| **Use in PIA** | mission-control.html (public), webhook URLs, GumballCMS inbound | M1↔M2↔M3 API calls, remote agent spawning |
| **Cost** | Free | Free up to 3 users / 100 devices |

**The answer for PIA: use both.** They solve different problems.

- **Tailscale (already in use):** Keep it for M1↔M2↔M3 private API calls, remote agent spawning, SSH access. This is the right tool.
- **Cloudflare Tunnel (add this):** Use for anything that needs a public URL — the mission-control dashboard, webhook endpoints for calendar triggers, GumballCMS WhatsApp webhook, Eliyahu briefing email links, etc.

### Specific PIA Tunnels to Create

| Hostname | Routes To | Purpose |
|---|---|---|
| `pia.sodalabs.ai` | `localhost:3000` | Mission Control dashboard — public access |
| `webhooks.sodalabs.ai` | `localhost:3000/api/webhooks/*` | Calendar triggers, WhatsApp callbacks |
| `gumball.sodalabs.ai` | GumballCMS server | WhatsApp-first CMS inbound |

### Security: Combining Tunnel + Zero Trust Access

Put Cloudflare Access in front of `pia.sodalabs.ai` — any visitor is required to authenticate via Google SSO or one-time email pin before seeing the dashboard. Free up to 50 users. Zero code changes to PIA.

---

## Deep Dive 3: Cloudflare Email Routing

### What It Is

A free service that intercepts inbound email at Cloudflare's MX records for your domain and forwards it to any destination inbox. Supports up to 200 forwarding rules. Requires your domain's DNS to be on Cloudflare.

### What It Can and Cannot Do

| Can Do | Cannot Do |
|---|---|
| Receive mail at fisher2050@sodalabs.ai | Send outbound email from those addresses |
| Forward to any Gmail/Outlook/other inbox | Act as an SMTP server |
| Catch-all rule (anything@sodalabs.ai → one inbox) | Provide mailboxes/storage |
| Process mail with Email Workers (custom logic) | Handle mailing lists |
| Up to 200 custom addresses | Provide IMAP/POP3 access |

### Setup for sodalabs.ai Agents

```
DNS Requirements (auto-configured by Cloudflare):
MX 1: route1.mx.cloudflare.net
MX 2: route2.mx.cloudflare.net
MX 3: route3.mx.cloudflare.net
TXT:  v=spf1 include:_spf.mx.cloudflare.net ~all
```

**Routing rules to create:**

| Custom Address | Forwards To | Purpose |
|---|---|---|
| fisher2050@sodalabs.ai | mic@... or jobs-inbox@... | Fisher2050 receives task requests |
| eliyahu@sodalabs.ai | mic@... | Eliyahu briefing replies |
| ziggi@sodalabs.ai | mic@... | Ziggi QA reports |
| tim@sodalabs.ai | mic@... | Tim Buc archive notifications |
| *@sodalabs.ai (catch-all) | mic@... | Catch anything else |

**Cost: $0. Forever.**

### Outbound Email (Agents Sending)

Email Routing is inbound-only. For outbound (agents sending morning briefings, Fisher2050 dispatching task notifications), you need a transactional email provider. PIA already has this solved:

- **`Downloads/sodalabs/`** — has Resend + SendGrid integration with 7 email templates already built
- **Resend free tier:** 100 emails/day, 3,000/month — sufficient for 12 agents + cron emails
- **The gap to close:** Copy the Resend service from sodalabs into pia-system, or call it via HTTP. The email service work from the Feb 20 session (`src/services/email.ts`) already covers this.

### Advanced: Email Workers

For agents that need to *process* inbound email programmatically (e.g., Fisher2050 receiving task requests via email and parsing them into the jobs queue):

```typescript
// Email Worker — triggered when fisher2050@sodalabs.ai receives mail
export default {
  async email(message, env, ctx) {
    const subject = message.headers.get('subject');
    const from = message.from;
    // Parse task from email body
    // POST to PIA jobs API
    await fetch('https://pia.sodalabs.ai/api/jobs', {
      method: 'POST',
      body: JSON.stringify({ task: subject, requester: from })
    });
    message.forward('mic@realdomain.com'); // also forward to Mic
  }
}
```

This is free within Cloudflare Workers limits.

---

## Integration Recommendations: What to Do TODAY vs Later

### TODAY — Easy Wins (< 2 hours total)

**1. Cloudflare AI Gateway (30 minutes)**

Priority: Critical. One URL change in `src/mission-control/agent-session.ts`.

Steps:
1. Create free Cloudflare account at cloudflare.com (if not already)
2. Go to AI Gateway in the dashboard → Create gateway named `pia-agents`
3. Get your gateway URL: `https://gateway.ai.cloudflare.com/v1/{account_id}/pia-agents/anthropic`
4. In `src/mission-control/agent-session.ts`, update the Anthropic SDK initialisation to use `baseURL`
5. Optionally store the gateway URL in `.env` as `CLOUDFLARE_AI_GATEWAY_URL`
6. Watch every agent call appear in the Cloudflare dashboard with full logs

**2. Cloudflare Email Routing (20 minutes)**

Priority: High. Gives all 12 agents real email addresses.

Steps:
1. Add sodalabs.ai to Cloudflare DNS (transfer nameservers or use Cloudflare as secondary)
2. Enable Email Routing in Cloudflare dashboard
3. Create routing rules for each agent address
4. Test by sending to fisher2050@sodalabs.ai

**3. Cloudflare Tunnel for Mission Control (45 minutes)**

Priority: High. Gives mission-control.html a public HTTPS URL.

Steps:
1. `npm install -g cloudflared` (or download binary for Windows M1)
2. `cloudflared tunnel login`
3. `cloudflared tunnel create pia-hub`
4. Create config.yml mapping pia.sodalabs.ai → localhost:3000
5. Add DNS CNAME in Cloudflare dashboard
6. Install as Windows service for auto-start

### NEXT WEEK — Medium Effort

**4. Cloudflare Zero Trust Access on mission-control dashboard**
- Wrap `pia.sodalabs.ai` with email pin authentication
- Prevents unauthorized access to agent dashboard
- Free up to 50 users
- No Express code changes needed

**5. Cloudflare R2 for Agent Archive Storage**
- Tim Buc currently archives agent session logs to SQLite
- For long-term storage (recordings, video, large files from Videohoho), R2 is better
- 10 GB/month free, zero egress — this is a massive saving vs AWS S3
- Use for: Videohoho exports, Bird Fountain generated images, agent session transcripts

**6. AI Gateway Rate Limiting per Agent**
- Once gateway is in place, add per-minute rate limits for each agent type
- Fisher2050 (cron) → 10 req/min max
- Eliyahu (briefings) → 5 req/min max
- Prevents billing surprise from cron bugs

### LATER — When Scale Demands It

**7. Cloudflare Pages for static frontends**
- sodalabs.ai marketing site → Cloudflare Pages (free, unlimited bandwidth)
- Farcake2025 Next.js frontend → Cloudflare Pages
- `public/pia-book.html` as standalone site → Cloudflare Pages
- Connect GitHub repo → auto-deploys on push

**8. Cloudflare Queues as a Fisher2050 job queue**
- Currently PIA uses SQLite jobs table (polling-based)
- Cloudflare Queues adds push-based delivery, guaranteed at-least-once, 14-day retention
- 1M ops/month included in $5 paid tier
- Migration path: Fisher2050 writes to Queues instead of SQLite jobs table → worker agents pull from Queues

**9. Cloudflare Workers for webhook processing**
- Lightweight Webhook Worker that validates GitHub/WhatsApp/calendar signatures
- Runs at edge (sub-5ms), logs to AI Gateway, forwards to PIA hub
- Eliminates need for PIA to be publicly accessible for webhooks directly

---

## What NOT to Use Cloudflare for in This Context

**Do NOT replace Tailscale with Cloudflare Tunnel for machine-to-machine traffic.**
Tailscale is faster (WireGuard P2P), end-to-end encrypted (Cloudflare cannot see traffic), and already integrated. Keep Tailscale for M1↔M2↔M3. Add Tunnel only for public-facing URLs.

**Do NOT migrate PIA's SQLite to Cloudflare D1.**
PIA's SQLite runs on M1 with 30+ tables, 50+ migrations, and tight server-side integration. D1 is designed for edge Workers, not traditional server apps. The performance characteristics are different (D1 has per-write latency, each database is in a single Cloudflare region). Keep local SQLite. D1 would only make sense for edge-native data (session tokens, rate limit counters).

**Do NOT use Cloudflare Workers to run the PIA Express server.**
Workers do not support Node.js filesystem APIs, long-running processes, SQLite, or PTY. PIA requires all of these. Workers are for lightweight edge functions, not full Express apps. Railway or Fly.io are better for deploying the Express server if you want cloud hosting.

**Do NOT use Workers KV as a primary database.**
KV has eventual consistency (reads can be stale for up to 60 seconds), 1KB value size limit (soft), and is not queryable. Use it only for caching simple values (API keys, feature flags) at the edge.

**Do NOT use Cloudflare Email Routing for outbound email.**
It cannot send. Continue using Resend (from sodalabs codebase) for outbound agent emails.

---

## Pricing Comparison vs Alternatives

### For Tunnel / Reverse Proxy

| Service | Cost | Notes |
|---|---|---|
| **Cloudflare Tunnel** | **Free** | No port forwarding, no public IP, works behind CGNAT |
| ngrok | $8/month (free has session limits) | Session expires, random URLs on free |
| Tailscale Funnel | Free (3 users) | Public-facing tunnels via Tailscale — less mature than Cloudflare |
| VPS (Hetzner/DigitalOcean) + Nginx | $5-6/month | Full control, requires maintenance, public IP |
| Cloudflare Tunnel | **Winner** for PIA | Zero cost, stable URLs, Cloudflare CDN included |

### For Object Storage

| Service | Cost per GB/month | Egress | Free Tier |
|---|---|---|---|
| **Cloudflare R2** | **$0.015** | **$0** | **10 GB/month** |
| AWS S3 | $0.023 | $0.09/GB | 5 GB (12 months only) |
| Backblaze B2 | $0.006 | $0.01/GB (over 1 GB/day) | 10 GB |
| Wasabi | $0.0068 | $0 | No free tier |
| Verdict | R2 wins on egress for media-heavy apps (Videohoho, Bird Fountain assets) | | |

### For Email Routing

| Service | Cost | Features |
|---|---|---|
| **Cloudflare Email Routing** | **Free** | Inbound only, up to 200 rules |
| ImprovMX | Free (25 aliases) / $9/month | Inbound + some outbound |
| Namecheap Private Email | $12/year | Full mailboxes |
| Google Workspace | $6/user/month | Full mailboxes, outbound, calendar |
| Verdict | Cloudflare for routing (free) + Resend for outbound = $0-7/month total | | |

### For AI Request Logging / Gateway

| Service | Cost | Anthropic Support |
|---|---|---|
| **Cloudflare AI Gateway** | **Free (core)** | Yes |
| Portkey | $49/month (Starter) | Yes |
| LiteLLM (self-hosted) | Free (hosting costs) | Yes |
| Helicone | Free up to 10K logs/month | Yes |
| Braintrust | Free (500K tokens logged) | Yes |
| Verdict | Cloudflare wins on cost for this usage volume | | |

### For Static Site Hosting

| Service | Cost | Bandwidth | Build Minutes |
|---|---|---|---|
| **Cloudflare Pages** | **Free** | **Unlimited** | Unlimited |
| Vercel | Free (100 GB bandwidth) | 100 GB | 6,000 min/month |
| Netlify | Free (100 GB bandwidth) | 100 GB | 300 min/month |
| Verdict | Cloudflare Pages wins on bandwidth; Vercel wins for Next.js-specific features |

---

## Full Architecture Recommendation for PIA + Cloudflare

```
                           ┌─────────────────────────────────────┐
                           │         Cloudflare Edge             │
                           │                                     │
                           │  Tunnel ──► pia.sodalabs.ai        │
                           │  Access ──► Google SSO guard        │
                           │  Email  ──► @sodalabs.ai routing    │
                           │  R2     ──► agent archives/media    │
                           │  Pages  ──► marketing + pia-book   │
                           └──────────────┬──────────────────────┘
                                          │
                           ┌─────────────▼──────────────────────┐
                           │    Cloudflare AI Gateway           │
                           │  ┌─────────────────────────────┐   │
                           │  │ Logging │ Cache │ Rate Limit │   │
                           │  │ Fallback│ Moderation        │   │
                           │  └──────────────┬──────────────┘   │
                           └─────────────────┼──────────────────┘
                                             │
                           ┌─────────────────▼──────────────────┐
                           │         Anthropic API              │
                           │  Claude Sonnet 4.5 / claude-3.5    │
                           └─────────────────────────────────────┘

Local Network (Tailscale mesh):
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  M1: Izzit7  │◄──►│  M2: soda-  │◄──►│  M3: SODA-  │
│  Hub/Express │    │  monster    │    │  YETI        │
│  :3000       │    │  :3000      │    │  :3000       │
│  cloudflared │    │  Tailscale  │    │  Tailscale   │
└──────────────┘    └──────────────┘    └──────────────┘
```

---

## Sources

- [Cloudflare Tunnel Documentation](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/)
- [Cloudflare AI Gateway Overview](https://developers.cloudflare.com/ai-gateway/)
- [Cloudflare AI Gateway Pricing](https://developers.cloudflare.com/ai-gateway/reference/pricing/)
- [Cloudflare AI Gateway Anthropic Integration](https://developers.cloudflare.com/ai-gateway/usage/providers/anthropic/)
- [Cloudflare AI Gateway Fallbacks](https://developers.cloudflare.com/ai-gateway/configuration/fallbacks/)
- [Cloudflare AI Gateway Caching](https://developers.cloudflare.com/ai-gateway/features/caching/)
- [Cloudflare AI Gateway Guardrails](https://blog.cloudflare.com/guardrails-in-ai-gateway/)
- [Cloudflare AI Gateway Logging](https://developers.cloudflare.com/ai-gateway/observability/logging/)
- [Cloudflare AI Gateway 2026 Pricing — TrueFoundry](https://www.truefoundry.com/blog/cloudflare-ai-gateway-pricing)
- [Cloudflare Email Routing Overview](https://developers.cloudflare.com/email-routing/)
- [Cloudflare Email Routing — Free Custom Domain Emails](https://altersquare.medium.com/free-custom-domain-emails-with-gmail-and-cloudflare-a-beginners-guide-84d759b373f7)
- [Cloudflare R2 Pricing](https://developers.cloudflare.com/r2/pricing/)
- [Cloudflare R2 vs AWS S3 Comparison](https://www.vantage.sh/blog/cloudflare-r2-aws-s3-comparison)
- [Cloudflare Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare Workers Free Tier](https://www.freetiers.com/directory/cloudflare-workers)
- [Cloudflare Workers KV Pricing](https://developers.cloudflare.com/kv/platform/pricing/)
- [Cloudflare Queues Free Plan Launch (Feb 2026)](https://developers.cloudflare.com/changelog/2026-02-04-queues-free-plan/)
- [Cloudflare D1 Pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [Cloudflare Zero Trust Plans](https://www.cloudflare.com/plans/zero-trust-services/)
- [Cloudflare Pages vs Vercel vs Netlify 2025](https://www.digitalapplied.com/blog/vercel-vs-netlify-vs-cloudflare-pages-comparison)
- [Cloudflare Tunnel vs Tailscale — XDA Developers](https://www.xda-developers.com/switching-from-cloudflare-tunnels-tailscale-hated-it/)
- [Tailscale Funnel vs Cloudflare Tunnel comparison](https://onidel.com/blog/tailscale-cloudflare-nginx-vps-2025)
- [Cloudflare Workers vs Railway](https://www.srvrlss.io/compare/cloudflare-vs-railway/)
- [Cloudflare AI Gateway — AI Week 2025 Refresh](https://blog.cloudflare.com/ai-gateway-aug-2025-refresh/)
- [Cloudflare Introduces Cloudflare for AI Suite](https://www.cloudflare.com/press/press-releases/2025/cloudflare-introduces-cloudflare-for-ai/)
- [Run cloudflared as Linux Service](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/as-a-service/linux/)
- [Run cloudflared as Windows Service](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/as-a-service/windows/)
- [Cloudflare R2 Free Tier Details](https://www.oreateai.com/blog/cloudflare-r2s-free-tier-navigating-10gb-of-storage-in-2025/15fffb2f3e99c7ec704e03f432c6e23a)
- [Billions of Logs — AI Gateway Scaling](https://blog.cloudflare.com/billions-and-billions-of-logs-scaling-ai-gateway-with-the-cloudflare/)
