# Mac Mini M4 for PIA — Hardware Research
**Compiled: 2026-02-23 | 24 web searches | South Africa pricing included**

---

## Executive Summary

1. **Yes, but only if local inference is on your roadmap.** For pure Claude API orchestration (your current state), a Mac Mini M4 is unnecessary — your Windows machines are not the bottleneck. The hardware pays off the moment you start routing tasks to a local 7B–14B model (routing, classification, Ziggi's analysis loops) and reducing API spend.

2. **Sweet spot: M4 24GB at R18,500–R19,000.** NOT the M4 Pro 24GB — that's the worst value config (pays R6,000 Pro premium for identical model capacity). The Pro only becomes worthwhile at 48GB+ for the M1 Hub.

3. **Your codebase is 95% cross-platform today.** One file has a hardcoded `powershell.exe` (`src/comms/orchestrator.ts` line 97) that will crash on macOS. Everything else already has `process.platform === 'win32'` guards. Migration cost: 2–4 hours.

---

## Specs — What Actually Differs for PIA

| Spec | M4 (base) | M4 Pro | Notes for PIA |
|---|---|---|---|
| CPU cores | 10 (4P + 6E) | 12–14 (8–10P cores) | More P-cores help parallel SDK agent spawns |
| GPU cores | 10 | 16–20 | Matters for local inference throughput |
| RAM options | 16GB, 24GB | 24GB, 48GB, 64GB | Critical fork point |
| Memory bandwidth | ~120 GB/s | ~150–160 GB/s | 30% higher = faster local inference tokens/sec |
| Neural Engine | 38 TOPS | 38 TOPS | Same — identical on-device AI speed |
| TDP idle / load | 3–4W / 30–45W | 4–5W / 40–60W | Both run fine 24/7 unattended |

**Key insight:** Memory bandwidth is the LLM inference bottleneck, not compute. 24GB is the minimum for PIA production use — 16GB fills up fast with OS + Node.js + SQLite + 4–5 concurrent agent buffers.

---

## South Africa Pricing (ZAR)

*Wootware, iStore, Digicape — Feb 2026*

| Config | RAM | SSD | ZAR |
|---|---|---|---|
| M4 | 16GB | 256GB | R13,199 |
| M4 | 16GB | 512GB | R15,499–R15,999 |
| **M4** | **24GB** | **512GB** | **R18,499–R19,999** ← worker sweet spot |
| M4 Pro | 24GB | 512GB | R24,999–R30,999 ← skip this |
| **M4 Pro** | **48GB** | **1TB** | **R38,000–R42,000** ← hub only |
| M4 Pro | 64GB | 1TB | R44,000–R48,000 |

Live pricing: [Wootware](https://www.wootware.co.za/apple-mcyt4so-a-mac-mini-m4-10-core-24gb-on-board-lpddr5-10-core-gpu-512gb-ssd-macos-15-silver-mini-desktop-pc.html) · [iStore ZA](https://www.istore.co.za/shop-mac-mini-m4) · [The Mac Index ZA](https://themacindex.com/za/products/mac-mini/m4-24gb-512gb-mcyt4)

---

## USD Pricing (Apple MSRP)

| Config | RAM | SSD | USD MSRP | Street |
|---|---|---|---|---|
| M4 | 16GB | 256GB | $599 | $479–$499 |
| M4 | 16GB | 512GB | $799 | $669–$699 |
| **M4** | **24GB** | **512GB** | **$999** | $869–$929 |
| M4 Pro | 24GB | 512GB | $1,399 | $1,299 ← worst value |
| **M4 Pro** | **48GB** | **1TB** | **$1,999** | $1,799–$1,899 |
| M4 Pro | 64GB | 1TB | $2,499 | rarely discounted |

---

## Local Model Capability by RAM

*Ollama / MLX-LM on macOS*

| RAM | What runs well | Tokens/sec | Can't do |
|---|---|---|---|
| 16GB | Llama 3.2 3B, Qwen2.5 7B Q4, Mistral 7B Q4 | 28–35 t/s | 13B+ models sluggish |
| **24GB** | **Llama 3.1 8B Q8, Qwen2.5 14B Q4, DeepSeek R1 Distill 14B** | **14–32 t/s** | 32B+ won't load clean |
| 48GB | Llama 3.1 34B Q4, Qwen2.5 32B Q4, DeepSeek R1 32B Q4 | 11–16 t/s | 70B tight |
| 64GB | Llama 3.1 70B Q4, Qwen2.5 72B Q4 | 10–14 t/s | Near-frontier |

**PIA use case:** A 14B model on 24GB M4 at 15–18 t/s handles Ziggi's classification, Fisher2050's summarisation pass, and inter-agent routing logic without touching the Anthropic API. That's the ROI case.

---

## PIA Codebase macOS Compatibility

| File | Issue | Action |
|---|---|---|
| `src/comms/orchestrator.ts` line 97 | **CRASH** — hardcodes `powershell.exe` | Fix: `process.platform === 'win32' ? 'powershell.exe' : '/bin/bash'` |
| `src/tunnel/pty-wrapper.ts` | Uses `cmd.exe` — already guarded by `isWin` | No change needed |
| `src/orchestrator/autonomous-worker.ts` | Already has `win32` guard | No change needed |
| `src/api/routes/exec.ts` | Already has `win32` guard | No change needed |
| `src/index.ts` | Already has Darwin `open` branch | No change needed |
| `src/api/routes/files.ts` | Has `C:\\Windows` blocklist — harmless on macOS | Low priority |

**PM2**: works identically on macOS (`pm2 startup` generates launchd config automatically).
**Electron**: first-class Apple Silicon support, easier to build/notarize than Windows.
**SQLite (better-sqlite3)**: builds natively on ARM64, no changes.
**Docker**: use OrbStack instead of Docker Desktop on macOS (Docker Desktop has M4 core count bug).

### ⚠️ FileVault Warning
If FileVault disk encryption is enabled, every unexpected reboot requires physical password entry before the machine boots headlessly. For 24/7 server use: **disable FileVault** or use a Smart UPS + auto-login service account.

---

## Investment Breakdown — 3-Machine PIA Fleet

### Option A: 3 × M4 24GB — Best value, handles 7B–14B local models

| Machine | Role | Config | ZAR | USD |
|---|---|---|---|---|
| M1 Hub (replaces IZZIT7) | Hub + Fisher + crons | M4 24GB / 512GB | R19,000 | $999 |
| M2 Worker | Execution + local routing | M4 24GB / 512GB | R19,000 | $999 |
| M3 Worker | Execution + local inference | M4 24GB / 512GB | R19,000 | $999 |
| **Total** | | | **R57,000** | **$2,997** |

### Option B: M4 Pro 48GB Hub + 2 × M4 24GB Workers — Serious local LLM capability

| Machine | Role | Config | ZAR | USD |
|---|---|---|---|---|
| M1 Hub | Hub + all crons + 32B local models | M4 Pro 48GB / 1TB | R40,000 | $1,999 |
| M2 Worker | Execution + 14B local tasks | M4 24GB / 512GB | R19,000 | $999 |
| M3 Worker | Execution + 14B local tasks | M4 24GB / 512GB | R19,000 | $999 |
| **Total** | | | **R78,000** | **$3,997** |

### ROI Reality Check

| Factor | Number |
|---|---|
| Current API cost (est. 50K tokens/day) | ~$820/year |
| Savings if 40% shifts to local 14B model | ~$330/year |
| Option A payback (pure API savings) | ~9 years |
| Electricity cost (always-on Mac Mini M4) | ~$15–25/year USD |

**The API savings case is weak on its own. The real case is:**
- ⚡ Latency: local 14B at 15 t/s = 2–3 sec vs 8–12 sec API round-trip for classification
- 🔒 Privacy: agent memory, soul data, business intel never leaves your machines
- 🛡️ Reliability: no API rate limits, no outage dependency for background crons
- 🍎 Dev experience: macOS Electron development significantly smoother than Windows

---

## Community Verdict (Reddit / Forums, Feb 2026)

- **"Mac Mini M4 shortage is real — customers discovered you can run a local AI agent on it without breaking the bank"** — WCCFTech Feb 2026
- **M4 Pro 24GB is called the "trap config"** across multiple threads — pays Pro premium for same model capacity as M4 24GB
- **OrbStack over Docker Desktop** — consistent recommendation for M4 Mac Mini server use
- **FileVault + headless reboot** — most commonly-hit complaint for always-on server use
- **"The M4 with 24GB + Ollama + Qwen2.5 14B is the current go-to"** — MacRumors forum Feb 2026
- Mac Studio and eGPU removed from macOS 15+ — not relevant for PIA

---

## Alternatives

| Option | Cost | Inference speed | Verdict |
|---|---|---|---|
| Mac Mini M4 24GB | R19,000 ($999) | 14–18 t/s (14B) | Best all-round for PIA |
| Windows PC + RTX 4070 Ti | ~$1,800 | Faster for 30B+ | Louder, 250W+, no macOS Electron |
| Hetzner GEX44 GPU cloud | $160/month ($1,920/year) | High but shared | Mac Mini pays off in 15 months |
| GMKtec G3 Plus (mini PC) | $209 | 2–4 t/s (CPU-only) | Budget option, dev machine only |

---

## Final Recommendation

### If buying now:

**M1 Hub:** M4 Pro 48GB / 1TB — R38,000–R42,000 ZAR
- Hub runs Fisher2050, all crons, Tim Buc, Eliyahu, plus the most capable local model (32B class)
- 48GB lets you run DeepSeek R1 32B Q4 at 11–14 t/s for non-interactive background tasks

**M2 + M3 Workers:** M4 24GB / 512GB each — R18,500–R19,000 each
- Workers do execution only; 14B model is more than sufficient for routing and classification

**3-machine fleet: R78,000–R80,000 ZAR (~$3,997 USD)**

### Do NOT buy:
- ❌ M4 16GB/256GB — hits RAM pressure within months at PIA scale
- ❌ M4 Pro 24GB — worst value; $400 Pro premium for same model capacity as M4 24GB
- ❌ M4 Pro 64GB — overkill unless you specifically plan 70B local models; buy two M4 24GB instead

### Honest "not yet" case:
If local inference is NOT on the next 3-month roadmap, **hold the R78,000 and keep your Windows fleet**. Fix the one `powershell.exe` hardcode in `orchestrator.ts` now, and the codebase is macOS-ready when the time comes. Buy when B10 is shipped and you have a local routing layer — at that point the hardware purchase has an immediate functional payoff.

---

## Sources
- [Best Mac Mini for AI 2026 — marc0.dev](https://www.marc0.dev/en/blog/best-mac-mini-for-ai-2026-local-llm-agent-setup-guide-1770718504817)
- [DailyTechStack M4 Mac Mini for Local AI](https://dailytechstack.com/m4-mac-mini-local-ai/)
- [Like2Byte M4 DeepSeek R1 benchmarks](https://like2byte.com/mac-mini-m4-deepseek-r1-ai-benchmarks/)
- [Like2Byte M4 Pro 64GB 30B benchmarks](https://like2byte.com/mac-mini-m4-pro-64gb-30b-llm-benchmarks/)
- [InsiderLLM best local LLMs for Mac 2026](https://www.insiderllm.com/guides/best-local-llms-mac-2026/)
- [Mac Mini M4 shortage — WCCFTech](https://wccftech.com/m4-mac-mini-shortage-due-to-installing-ai-agent/)
- [MacRumors M4 Pro forum](https://forums.macrumors.com/threads/so-happy-with-the-m4-pro-i-can-finally-use-ai-stuff-locally.2442964/)
- [AppleInsider M4 pricing](https://prices.appleinsider.com/mac-mini-m4)
- [MacPrices.net M4 Pro deals](https://www.macprices.net/2026/02/22/mac-mini-with-m4-pro-cpu-on-sale-for-1299-100-off-apples-msrp-2/)
- [The Mac Index ZA](https://themacindex.com/za/products/mac-mini/m4-24gb-512gb-mcyt4)
- [Wootware SA](https://www.wootware.co.za/apple-mcyt4so-a-mac-mini-m4-10-core-24gb-on-board-lpddr5-10-core-gpu-512gb-ssd-macos-15-silver-mini-desktop-pc.html)
- [iStore ZA](https://www.istore.co.za/shop-mac-mini-m4)
- [Hypertext SA pricing](https://htxt.co.za/2024/11/south-africa-price-revealed-for-new-m4-macbook-pro-mac-mini-imac/)
- [Hostbor Mac Mini M4 home server review](https://hostbor.com/mac-mini-m4-home-server/)
- [Satechi always-on setup guide](https://satechi.com/blogs/news/mac-mini-m4-setup-for-local-ai-the-definitive-guide-to-storage-hubs-and-always-on-performance)
- [Electron Apple Silicon support](https://www.electronjs.org/blog/apple-silicon)
- [Docker M4 core count bug](https://github.com/docker/for-mac/issues/7487)
