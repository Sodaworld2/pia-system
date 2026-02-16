# Treasury Management Tools for Small DAOs: Comprehensive Research

**Date:** 2026-02-15
**Context:** Research for a 9-person DAO (SodaWorld/PIA) on Solana with a SODA governance token
**Scope:** Build vs. buy analysis for treasury management, tool reviews, real-world opinions

---

## Table of Contents

1. [The Landscape: State of DAO Treasury Management](#1-the-landscape)
2. [Squads Protocol (Solana)](#2-squads-protocol-solana)
3. [Request Finance](#3-request-finance)
4. [Parcel / Utopia Labs / Llama (Status Check)](#4-parcel--utopia-labs--llama)
5. [Solana-Native Treasury Tools (Realms, Streamflow, Snowflake)](#5-solana-native-treasury-tools)
6. [Crypto Accounting Tools (Coinbooks, Cryptio, Bitwave, TRES Finance)](#6-crypto-accounting-tools)
7. [Traditional Accounting Software (QuickBooks, Xero)](#7-traditional-accounting-software)
8. [Google Sheets and Simple Solutions](#8-google-sheets-and-simple-solutions)
9. [The Build vs. Buy Debate](#9-the-build-vs-buy-debate)
10. [Real Opinions from DAO Operators](#10-real-opinions-from-dao-operators)
11. [Recommendation for SodaWorld DAO](#11-recommendation-for-sodaworld-dao)
12. [Sources](#12-sources)

---

## 1. The Landscape

### Market Scale in 2025-2026

- Total DAO treasury assets have grown from $8.8 billion in early 2023 to over $30 billion.
- Active participants increased from 1.7 million to 5.1 million governance token holders.
- Average DAO treasury size is about $1.2 million.
- Top DAOs: Optimism ($5.5B), Arbitrum ($4.4B), Uniswap ($2.5B).
- DAOtimes tracked 50,845 active decentralized organizations managing $16.9 billion in 2025.

### Critical Problem: Concentration Risk

**85% of DAOs maintain dangerous single-asset concentration**, typically holding treasuries entirely in their native governance token. For every DAO experimenting with diversification, dozens still hold 80%+ of their treasuries in their own governance tokens -- which institutions view as fragility.

Best practice (per Llama, Ethereum Foundation, and others): maintain at least 1-2 years of operating expenses in stablecoins.

### The Tool Graveyard Problem

Multiple well-funded DAO treasury tools have shut down in the last 2 years, which is a major consideration when choosing tools. Parcel (processed $250M+ in payments, raised significant funding) and Utopia Labs (raised $23M from top VCs) both shut down despite significant adoption, primarily due to unsustainable business models in the DAO tooling space.

**This is arguably the strongest argument against depending on third-party DAO-specific tools for critical treasury functions.**

---

## 2. Squads Protocol (Solana)

### What It Is

Squads is the dominant multisig protocol on Solana. It is not a full "treasury management system" -- it is a secure multisig wallet with approval workflows, spending controls, and sub-account organization. Think of it as the Gnosis Safe equivalent for Solana, but Solana-native.

### Key Facts

| Attribute | Detail |
|---|---|
| **Founded** | 2021 (hackathon project, pivoted) |
| **Assets Secured** | $10B+ on Solana |
| **Users** | 100+ teams (Helium, Jito, Pyth, Tensor, etc.) |
| **Security** | First formally verified program on Solana; audited by OtterSec, Neodyme, Trail of Bits, Certora, Bramah Systems |
| **Open Source** | Yes (v4 on GitHub) |
| **Current Version** | v4 (v5 in development) |
| **Solana Support** | Native -- built exclusively for Solana |

### Pricing

| Tier | Cost | Features |
|---|---|---|
| **Basic** | One-time 0.1 SOL deployment fee | Enterprise-grade multisig security, core features |
| **Pro** | $49/month (30-day free trial) | Spending limits, roles, sub-accounts, time locks |
| **Enterprise** | Custom | Dedicated support, custom implementations |

All transaction fees are Solana network fees only. Squads does not charge per-transaction fees (except for Limit Orders).

### Features (v4)

- **Multisig wallets** with configurable M-of-N thresholds
- **Sub-accounts** to organize assets across departments/business lines
- **Spending limits** -- pre-approved allowances per member, per token, per time period, per destination
- **Roles** -- Proposer, Voter, Executor (can be combined)
- **Time locks** for high-value transactions
- **Multiple-party payments** (batch payouts)
- **SquadsX** -- browser extension for seamless multisig UX
- **SPL token management** -- create and manage Solana tokens directly

### What People Love

- Best-in-class security (formally verified, multiple audits)
- Clean, intuitive UI that abstracts away multisig complexity
- SquadsX makes it feel like a personal wallet with organizational controls
- Sub-accounts and spending limits bring real operational structure
- The only serious multisig option on Solana
- Low cost of entry (0.1 SOL for basic)

### What People Complain About / Limitations

- **Solana-only** -- no cross-chain support
- **Approval latency** -- multiple-signature requirements can delay transactions during emergencies
- **Network congestion** -- interactions require more on-chain actions compared to individual wallets, compounded during congestion
- **Not a full treasury management system** -- no accounting, no financial reporting, no invoicing
- **Non-technical members** can still find multisig workflows unintuitive
- **Pro features locked behind $49/month** -- spending limits and roles require paid plan

### Verdict for a 9-Person Solana DAO

**Essential.** This is the foundation layer. You will almost certainly use Squads as your multisig vault regardless of what other tools you layer on top. At $49/month for Pro, it is the most cost-effective way to get enterprise-grade treasury security on Solana.

---

## 3. Request Finance

### What It Is

Request Finance is a crypto-native invoicing, payroll, and expense management platform. It is the "accounts payable / accounts receivable" layer for crypto organizations. Used by 3,189+ finance leaders processing $1B+ in payments.

### Key Facts

| Attribute | Detail |
|---|---|
| **Founded** | 2018 (built on Request Network) |
| **Users** | MakerDAO, The Sandbox, Aave, and thousands of others |
| **Blockchains** | 10+ chains including Ethereum, Polygon, BSC, and **Solana** |
| **Currencies** | 150+ cryptocurrencies supported |
| **Integrations** | QuickBooks, Xero |
| **Solana Support** | **Yes** -- added with emphasis on speed and low cost |

### Pricing

| Plan | Cost | Details |
|---|---|---|
| **Free** | $0 | Limited features; Crypto-to-Fiat at 1.5% fee |
| **Invoicing** | 0.1% of invoice amount (max $2 per invoice) | Plus gas fees |
| **Paid Plans** | Subscription-based | 30-day free trial; save 16% on annual billing; fees start at 1% |

### Features

- **Invoicing**: Create, send, and track crypto invoices with fiat denomination
- **Payroll**: Recurring crypto salary payments
- **Expense Management**: Team members submit expenses for approval and crypto reimbursement
- **Real-time tracking**: Dashboard for all outgoing and incoming payments
- **Tax-ready**: Crypto-to-fiat denomination for accounting integration
- **Multi-chain**: Pay on whichever chain is cheapest/fastest
- **Off-ramping**: Built-in crypto-to-fiat conversion

### What People Love

- Makes crypto payments feel like traditional finance
- Clean invoicing workflow that both crypto-native and non-crypto people understand
- Integration with QuickBooks and Xero for bookkeeping
- Solana support means fast, cheap payments
- Actually used by major DAOs (MakerDAO, Aave ecosystem projects)

### What People Complain About

- Invoice amounts sometimes slightly off vs. direct wallet payments (rounding/conversion issues)
- Web app not responsive on all devices
- Mobile app does not show all features or work with same account as web
- Some users find the fee structure confusing at first

### Verdict for a 9-Person Solana DAO

**Strong candidate for the invoicing/payroll layer.** If your DAO needs to pay contributors, reimburse expenses, or send/receive invoices, Request Finance is one of the most mature options. The Solana support and free tier make it accessible. It pairs naturally with Squads (Squads holds the treasury; Request Finance manages the payment workflows).

---

## 4. Parcel / Utopia Labs / Llama (Status Check)

### Parcel -- SHUT DOWN

| Attribute | Detail |
|---|---|
| **Status** | **Discontinued** (services shut down) |
| **What It Was** | Treasury management platform for mass payouts, money streaming, payroll |
| **Peak Usage** | Processed $250M+ in payments, integrated with Gnosis Safe |
| **Why It Failed** | Could not find a sustainable monetization model despite high volume |
| **Lesson** | Even well-adopted DAO tools can die if the business model does not work |

The Parcel shutdown is frequently cited as a cautionary tale about depending on DAO-specific tooling startups.

### Utopia Labs -- SHUT DOWN (Pivoted)

| Attribute | Detail |
|---|---|
| **Status** | **Services suspended November 2023**, company pivoted |
| **What It Was** | "Operating system for DAOs" -- payment requests, payroll, contributor management |
| **Funding** | Raised $23M from Paradigm (Series A) |
| **Users** | Friends With Benefits (FWB), and other DAOs |
| **What Happened** | CEO Kaito Cunningham stated they were "not shutting down the company, rather moving away from our existing product and our existing direction" |
| **Current Status** | Pivoted away from DAO tooling entirely |

### Llama -- PIVOTED

| Attribute | Detail |
|---|---|
| **Status** | **Active but pivoted** -- moved from treasury management consulting to governance infrastructure |
| **What It Was** | Treasury management consultancy working directly with top DAOs (Aave, Uniswap, Gitcoin, PoolTogether, FWB, ARCx) on treasury strategies, financial reporting, and analytics |
| **Pivot** | Raised $6M to build role-based governance and access control platform for smart contracts |
| **Current Focus** | "Decentralization through access control" -- role splitting between service providers |
| **Treasury Tooling** | No longer their primary product |

### Key Takeaway

**Three of the most prominent DAO treasury management tools/services from 2021-2022 have either shut down or pivoted away from treasury management.** This is not coincidental -- it reflects the fundamental difficulty of building sustainable business models around DAO tooling, especially for treasury management. The market is small, DAOs are cost-sensitive, and free alternatives (multisig + spreadsheets) are "good enough" for many teams.

---

## 5. Solana-Native Treasury Tools

### Realms

| Attribute | Detail |
|---|---|
| **What It Is** | On-chain DAO governance and treasury management platform built on Solana's SPL Governance |
| **Status** | **Active** (updated with Token Extensions support in 2025) |
| **Cost** | Free (on-chain, open source) |
| **Users** | Mango, Metaplex, Grape, SamoDAO |
| **Features** | Proposal creation, on-chain voting, treasury dashboard, token-weighted governance, council-based governance |
| **Treasury** | Real-time ledger of assets visible to all stakeholders; proposal-based approvals for spending |
| **Grants** | Realms Ecosystem DAO (R.E.D.) launched with $200K in grants |

**Pros:** Free, fully on-chain, purpose-built for Solana DAOs, supports SPL Token Extensions, well-established.

**Cons:** More governance-focused than treasury-focused; treasury features are basic compared to Squads; UI can be intimidating for non-technical members.

**Verdict:** Realms is the governance layer. It handles proposals and voting. But for actual asset custody and operational treasury management (spending limits, roles, batch payments), Squads is more capable. Many Solana DAOs use both -- Realms for governance, Squads for treasury.

### Streamflow

| Attribute | Detail |
|---|---|
| **What It Is** | Token distribution platform -- vesting, streaming payments, airdrops, staking |
| **Status** | **Very active** (peak TVL ~$2.5B, 1.3M+ users, 26K+ projects) |
| **Cost** | Protocol fees on operations |
| **Solana** | Native Solana support (also multi-chain) |
| **Features** | Token vesting schedules, streaming payroll, batch distributions, staking, airdrops |
| **Recent** | Launched USD+ yield-bearing stablecoin backed by U.S. Treasury bills (Dec 2025) |

**Pros:** Excellent for token vesting and contributor payment streams; large user base; actively developing (stablecoin product); automates what would otherwise be manual monthly transfers.

**Cons:** Focused specifically on token distribution rather than general treasury management; not a full accounting or invoicing solution.

**Verdict:** **Highly relevant for SodaWorld.** If you need to vest SODA tokens to council members, stream payments to contributors, or run airdrops, Streamflow is the Solana-native solution. Pairs well with Squads (treasury vault) and Realms (governance decisions).

### Snowflake

| Attribute | Detail |
|---|---|
| **What It Is** | Multisig wallet and on-chain automation for Solana |
| **Status** | Active |
| **Cost** | Free to use |
| **Positioning** | "The Gnosis Safe of Solana" |
| **Features** | Multisig with customizable signature requirements, DCA/stop-loss from multisig, direct protocol integrations (Solend, Marinade, Friktion) |

**Pros:** Free, Gnosis-Safe-like UX, DeFi integrations from within the multisig.

**Cons:** Much smaller ecosystem and adoption than Squads; less formally verified; fewer enterprise features. Squads has essentially won the Solana multisig market.

**Verdict:** Worth knowing about as an alternative, but Squads is the clear market leader with $10B+ secured vs. Snowflake's smaller footprint.

### Other Solana Tools

- **Integral**: Enterprise-grade treasury management infrastructure, real-time monitoring across chains/wallets/custodians, $10B+ monthly volume processing. More suited for large organizations.
- **Ownbit**: Multisig solution supporting up to 15 signers with configurable thresholds. Smaller player.

---

## 6. Crypto Accounting Tools

### Coinbooks (Now Layerup)

| Attribute | Detail |
|---|---|
| **Status** | **Uncertain / Likely inactive as DAO tool.** Tracxn reports Coinbooks "not active anymore." Company rebranded to Layerup and pivoted to "Agentic AI OS for Financial Services and Insurance" (per Y Combinator) |
| **What It Was** | Accounting software built specifically for DAOs |
| **Funding** | Raised $3.2M-$3.7M (Y Combinator, Multicoin Capital, Polygon founders, Seed Club, Orange DAO) |
| **Founded By** | 21-year-old CEO Arnav Bathla |
| **What Happened** | Rebranded and pivoted entirely away from DAO accounting |

**Verdict:** Do not rely on this. Another casualty of the DAO tooling business model problem.

### Cryptio

| Attribute | Detail |
|---|---|
| **What It Is** | Enterprise crypto accounting and reporting platform |
| **Status** | **Active** (one of two leaders alongside TRES Finance) |
| **Pricing** | Basic: $449/month; Pro: $899/month; setup fee: $2,500-$5,000 |
| **Integrations** | Xero, QuickBooks; DeFi protocols; wallets; exchanges; custodians |
| **Compliance** | GAAP & IFRS compliant reporting |
| **Chains** | Primarily EVM-focused |
| **Solana** | Limited / not a primary focus |

**What People Love:**
- "The best tool in the market" -- Finance executive at The Sandbox
- "Friendly and easy to reach team" -- multiple reviewers
- Great Xero integration
- 4.5/5 rating on review platforms

**What People Complain About:**
- DeFi balance tracking "often inaccurate and may only work reliably for basic EVM activity"
- "Not flexible: it prefers to take over your entire crypto portfolio"
- Slow to reflect token prices for newly listed tokens
- Needs more exchange integrations
- Emerging blockchain support lags behind competitors
- **Very expensive for small DAOs** -- $449/month minimum + setup fees

**Verdict:** **Too expensive and too EVM-focused for a 9-person Solana DAO.** The $449/month minimum is nearly 10x what Squads Pro costs, and Solana is not their strong suit.

### Bitwave

| Attribute | Detail |
|---|---|
| **What It Is** | Enterprise digital asset accounting, tax, and compliance platform |
| **Status** | **Active and growing** -- only enterprise crypto accounting platform in G2's Winter Accounting Grid |
| **Pricing** | **Opaque** -- requires contacting sales for a quote. Enterprise pricing model |
| **Integrations** | QuickBooks, Xero, NetSuite; blockchains; DeFi protocols; centralized exchanges; NFT marketplaces |
| **Features** | Automated transaction categorization, customizable inventory methods, DeFi tracking, staking rewards, crypto invoicing, audit-ready reporting |
| **Chains** | Broad multi-chain support including major chains |

**What People Love:**
- Breadth of native integrations (widest in the market)
- Specialized DeFi and staking accounting
- Stablecoin payment features
- Audit-ready reporting
- Strong enterprise reputation

**What People Complain About:**
- Pricing is opaque -- enterprise sales process
- Clearly targeted at enterprises, not small teams
- "Individuals doing their personal taxes and books will likely find the product is not suited for their particular needs"

**Verdict:** **Overkill for a 9-person DAO.** Enterprise tool, enterprise pricing, enterprise sales cycle. Not the right fit unless you are managing tens of millions.

### TRES Finance

| Attribute | Detail |
|---|---|
| **What It Is** | Crypto accounting and treasury management platform |
| **Status** | **Active** -- emerging as a leader alongside Cryptio in 2025 |
| **Pricing** | Enterprise pricing (contact for quote) |
| **Chains** | 200+ blockchains connected |
| **Features** | Automated categorization, valuation, reconciliation, GAAP/IFRS reporting; proprietary Financial Data Lake; CPA-level support |
| **Users** | Foundations, protocols, DAOs, exchanges, asset managers |

**What People Love:**
- "Replaces scattered spreadsheets with clean, audit-ready data"
- Handles complex DeFi operations and multi-chain activities
- Some organizations reduced month-end closing from 5 days to 1 day
- CPA-level support included

**Verdict:** **Also enterprise-grade and likely too expensive for a small DAO.** But worth noting as the space matures -- if SodaWorld grows significantly, TRES could be relevant later.

### Coinshift

| Attribute | Detail |
|---|---|
| **What It Is** | Treasury management and infrastructure platform for DAOs |
| **Status** | **Active** (Series A, $17.5M raised from Sequoia, Tiger Global) |
| **Pricing** | Free trial available; detailed pricing requires visiting their site |
| **Features** | Unified dashboard across multiple safes/networks, cashflow reporting, portfolio history, batched transactions, automated financial reporting |
| **Chains** | EVM-focused (built on top of Gnosis Safe/Safe) |
| **Solana** | **No native Solana support** (Safe/Gnosis Safe does not support Solana) |

**Verdict:** **Not usable for Solana.** Great product for EVM DAOs, but irrelevant for a Solana-based DAO.

---

## 7. Traditional Accounting Software

### QuickBooks

| Attribute | Detail |
|---|---|
| **Crypto Support** | **No native support** -- requires manual entry or third-party integrations |
| **Decimal Places** | Only 2 decimal places (crypto needs up to 18) |
| **Wallet Integration** | None -- cannot link crypto wallets |
| **Workarounds** | Koinly, Cryptoworth, SoftLedger can push data into QuickBooks |
| **Cost** | Starts at ~$30/month for basic plan |

**Key Limitation:** You cannot use QuickBooks alone for crypto accounting. Every crypto transaction must be manually entered or piped through a third-party tool. The 2-decimal-place limitation makes accurate crypto record-keeping nearly impossible without middleware.

**DeFi Support:** Only through integrations like Koinly (liquidity mining, yield farming, lending, borrowing, DEX swaps).

### Xero

| Attribute | Detail |
|---|---|
| **Crypto Support** | **No native support** but better integration ecosystem than QuickBooks |
| **Decimal Places** | 4 decimal places (better than QuickBooks but still insufficient for many crypto operations) |
| **Integrations** | Cryptoworth (two-way sync), Cryptio, Koinly, Bitwave all have Xero integrations |
| **Cost** | Starts at ~$15/month; unlimited users (cheaper than QuickBooks for teams) |
| **Advantage** | Official partnership with Cryptoworth gives it an edge for crypto |

**Key Limitation:** Still requires a crypto sub-ledger tool to handle the actual crypto transaction tracking, categorization, and valuation. Xero itself cannot track wallets, parse on-chain data, or handle DeFi positions.

### Verdict on Traditional Accounting Software

**Neither QuickBooks nor Xero works alone for crypto.** However, if your DAO needs proper books for tax or legal purposes, the pattern is:

1. Use a crypto sub-ledger tool (Koinly, CryptoTaxCalculator, or Cryptoworth) to track on-chain activity
2. Push summarized journal entries into Xero or QuickBooks
3. Use Xero/QuickBooks for standard financial reporting

For a 9-person DAO, **Xero + Koinly** is likely the most cost-effective combination if you need formal accounting. But you may not need this level of formality yet.

---

## 8. Google Sheets and Simple Solutions

### The Reality

Many small DAOs, especially in their early stages, simply use Google Sheets (or Notion databases) for treasury tracking. This is not a failure -- it is pragmatic.

**What Real DAOs Do:**
- SSV DAO publishes its full treasury tracker as a public Google Sheet
- Many small DAOs maintain a simple spreadsheet with: date, description, amount, token, from, to, tx hash, category
- Rocket Pool's pDAO publishes regular treasury reports (effectively spreadsheet-derived)
- Colony's documentation acknowledges that simple task/payment tracking can substitute for complex tooling

**Advantages:**
- Free
- Everyone knows how to use it
- Real-time collaboration
- Can be made public for transparency
- Formulas and graphs for basic analytics
- No vendor lock-in
- Cannot be shut down (unlike Parcel, Utopia Labs, Coinbooks...)

**Disadvantages:**
- No on-chain verification (trust the person updating the sheet)
- Manual entry for every transaction
- No automated wallet tracking
- Error-prone at scale
- No approval workflows
- No multi-sig integration
- Does not scale past ~50 transactions/month without becoming painful

### Verdict

**Perfectly reasonable for a 9-person DAO in its first year**, especially alongside Squads (which handles the actual on-chain treasury security). The combination of Squads for custody + Google Sheets for tracking is arguably what most small DAOs actually use, even if they do not talk about it publicly.

---

## 9. The Build vs. Buy Debate

### The Case for Building Custom

1. **Tool graveyard risk**: Parcel, Utopia Labs, and Coinbooks all shut down or pivoted. Custom code cannot be discontinued by a third party.
2. **Exact fit**: Your 9-person DAO has specific needs (SODA token, Solana, AI mentoring marketplace) that generic tools may not cover.
3. **Learning and ownership**: Building gives the team deep understanding of treasury mechanics.
4. **No recurring costs**: Beyond hosting and maintenance.
5. **Integration**: Custom backend can integrate directly with your governance, marketplace, and AI systems.

### The Case for Buying/Adopting Existing Tools

1. **Security**: Squads is formally verified and audited by 5+ security firms. Can you match that?
2. **Time to market**: Building a secure treasury system from scratch takes months. Squads takes 5 minutes.
3. **Maintenance burden**: A 9-person DAO should not be maintaining core financial infrastructure. Focus on your actual product.
4. **Proven at scale**: Squads secures $10B+. Your custom code secures... your $10K.
5. **Regulatory/audit credibility**: Using established tools looks better to partners, investors, and regulators.
6. **Cost**: Squads Pro at $49/month is vastly cheaper than the developer time to build and maintain a custom alternative.

### The Consensus Answer

The industry consensus, reflected across multiple sources and analyses:

> "Start with established platforms that offer APIs (like Safe on EVM or Squads on Solana) rather than building from scratch, unless you have specific custom requirements that justify the development overhead."

> "Coding a DAO is simple when you use the existing templates... start with an open-source contract and go from there."

> "In 2025, choosing your DAO tooling stack is no longer a tactical decision -- it is a strategic one. The platform you choose shapes how your community organizes, how your treasury moves, and how decisions scale."

### The Pragmatic Middle Ground

**Do not build what already exists and works. Build only what is unique to your needs.**

- **Do not build**: Multisig custody, approval workflows, spending limits (use Squads)
- **Do not build**: Invoicing and payroll (use Request Finance or manual transfers)
- **Consider building**: Custom treasury dashboard that reads from Squads on-chain data, governance-treasury integration specific to your SODA token economics, automated treasury reporting tied to your AI modules
- **Definitely build**: Your marketplace, governance rules, AI mentoring system (these are your unique value)

---

## 10. Real Opinions from DAO Operators

### The Frustration Theme

While specific individual quotes from forums are difficult to surface at scale, the following themes emerge consistently across DAO governance forums, Medium posts, and project discussions:

**On treasury concentration:**
> "85% of DAOs hold their treasuries in a single crypto asset. For every DAO experimenting with diversification, dozens still hold 80%+ of their treasuries in their own governance tokens, which institutions view as fragility."

**On tool shutdowns:**
> "The notable discontinuation of Parcel in 2025 reveals the challenges facing DAO tooling business models. Despite processing over $250 million in payments and achieving integration with Safe, the platform ceased operations due to sustainable monetization difficulties."

**On silent erosion (Nexumo, Dec 2025):**
> "Most DAO treasuries don't blow up. They quietly leak through overexposure, yield-chasing, and discretionary spending, resulting in less runway and governance stress."

**On governance fatigue:**
> Smaller DAOs with less active voting are more at risk of malicious proposals or whale takeover. The governance overhead of treasury management can exhaust small teams.

**On the DeFipunk approach (Andrea Armanni, ExaGroup):**
> DAO treasury management in 2025 reflects the evolution of DeFi, with Ethereum as its backbone and plenty of liquidity. But the tooling for small DAOs has not kept pace with the sophistication available to large ones.

**On Squads specifically:**
> Users consistently praise the UX: "Squads transforms experiences that previously required developers to interact with the CLI into well-designed user flows contained within an intuitive interface."

**On the Ethereum Foundation's approach:**
> The Ethereum Foundation's Treasury Policy (June 2025) exemplifies best practices: maintaining a 2.5-year operational expenditure buffer in low-risk, liquid assets. This is the gold standard small DAOs should aspire to.

---

## 11. Recommendation for SodaWorld DAO

### Your Context

- 9-person council
- Solana blockchain
- SODA governance token
- AI mentoring marketplace (unique product)
- Early-stage treasury (likely under $100K initially)
- Need to be operational quickly
- Technical team available (you have developers)

### Recommended Stack

#### Layer 1: Treasury Custody -- Squads Protocol (ESSENTIAL)

**Cost:** 0.1 SOL one-time + $49/month for Pro
**Why:** There is no credible alternative for Solana multisig security. Formally verified, audited by 5 firms, $10B+ secured. Use this as your primary treasury vault.

**Setup:**
- Create a Squads multisig with 5-of-9 threshold (or 3-of-5 for operational speed)
- Create sub-accounts: Operations, Development Fund, Community Grants, Reserve
- Set spending limits for routine operations (e.g., $500/week for operational expenses without full council vote)
- Assign roles: designated Proposers for routine transactions, all council members as Voters for large expenditures

#### Layer 2: Governance -- Realms

**Cost:** Free (on-chain)
**Why:** Solana-native governance with proposal creation, voting, and treasury visibility. Pairs naturally with Squads.

**Setup:**
- Create a Realms DAO with SODA token-weighted voting
- Use proposals for treasury allocations above spending limits
- Public transparency into all governance decisions

#### Layer 3: Token Distribution -- Streamflow

**Cost:** Protocol fees only
**Why:** If you need SODA token vesting for council members, contributor payment streams, or future airdrops, Streamflow is the mature Solana-native solution.

**Setup:**
- Vesting schedules for founding council SODA allocations
- Streaming payments for regular contributors (if applicable)

#### Layer 4: Invoicing/Payments -- Request Finance (OPTIONAL, add when needed)

**Cost:** Free tier available; 0.1% per invoice (max $2)
**Why:** When you start paying external contractors, receiving payments for services, or need proper invoice records. Supports Solana natively.

**When to add:** Once you have regular payment flows (5+ payments/month).

#### Layer 5: Bookkeeping -- Google Sheets (START HERE) then Xero + Koinly (LATER)

**Cost:** Free / ~$15/month + Koinly fees later
**Why:** For your first year, a well-structured Google Sheet tracking all treasury movements is sufficient. Upgrade to Xero + Koinly when you need formal accounting for tax, legal, or audit purposes.

**Template columns:** Date, Description, Category, Token, Amount, USD Value, From Wallet, To Wallet, Tx Hash, Approved By, Notes

#### Layer 6: Custom Dashboard -- Build This Yourself

**Cost:** Development time only
**Why:** This is where "build" makes sense. Create a simple dashboard that reads Squads on-chain data, displays treasury balances, shows recent transactions, and integrates with your PIA system. This is unique to your product and does not exist as an off-the-shelf tool.

### What NOT to Do

1. **Do not build your own multisig.** Squads has formal verification. You do not.
2. **Do not buy Cryptio, Bitwave, or TRES Finance.** They cost $449-$900+/month and are designed for enterprises managing millions. You are a 9-person DAO.
3. **Do not depend on a single DAO-specific startup** for critical functions. Parcel, Utopia Labs, and Coinbooks all died. Use tools backed by protocol-level infrastructure (Squads, Realms) or tools with broad non-DAO customer bases (Request Finance, Xero).
4. **Do not hold 100% of treasury in SODA.** Follow the Llama/EF guidance: maintain 1-2 years of operating expenses in stablecoins (USDC on Solana).
5. **Do not over-engineer.** A 9-person DAO does not need enterprise treasury management. Start simple, add complexity when it becomes painful.

### Total Monthly Cost

| Tool | Monthly Cost |
|---|---|
| Squads Pro | $49 |
| Realms | $0 |
| Streamflow | Protocol fees (~$0-5) |
| Google Sheets | $0 |
| **Total** | **~$50-55/month** |

Add Request Finance and Xero later when needed: +$15-30/month.

### Growth Path

1. **Month 1-6:** Squads + Realms + Google Sheets. Keep it simple.
2. **Month 6-12:** Add Streamflow for SODA vesting. Add Request Finance if payment volume justifies it. Build custom dashboard.
3. **Year 2+:** If treasury grows past $500K, evaluate Xero + Koinly for formal accounting. If treasury grows past $5M, evaluate TRES Finance or Cryptio.

---

## 12. Sources

### Squads Protocol
- [Squads: From Zero to $10B on Solana (Fystack)](https://fystack.io/blog/squads-from-zero-to-the-multisig-protocol-securing-10b-on-solana)
- [Squads v4 GitHub](https://github.com/Squads-Protocol/v4)
- [Squads Documentation](https://docs.squads.so/main)
- [Squads Pricing](https://docs.squads.so/main/getting-started/pricing)
- [Squads Spending Limits Blog](https://squads.xyz/blog/spending-limits)
- [Squads v5 Announcement](https://squads.xyz/blog/squads-protocol-v5)
- [Squads on Solana Compass](https://solanacompass.com/projects/squads)
- [Squads Protocol Overview (Linity)](https://linity.com/projects/squads-protocol)
- [QuickNode Squads Guide](https://www.quicknode.com/guides/solana-development/3rd-party-integrations/multisig-with-squads)

### Request Finance
- [Request Finance DAO Treasury Management](https://www.request.finance/crypto-treasury-management/dao-treasury-management)
- [Request Finance Pricing](https://www.request.finance/pricing)
- [Request Finance Solana Support](https://www.request.finance/post/solana-payments-now-supported-in-request-finance)
- [Request Finance on Capterra](https://www.capterra.com/p/246076/Request-Finance/)
- [Request Finance Review (Finbold)](https://finbold.com/review/request-finance-review/)
- [Request Finance on GetApp](https://www.getapp.com/finance-accounting-software/a/request-finance/)

### Parcel / Utopia Labs / Llama
- [Utopia Labs Sunset (Blockworks)](https://blockworks.co/news/utopia-labs-business-model-shift-sunset)
- [Parcel (parcel.money)](https://parcel.money/)
- [Llama Gitcoin Grant](https://gitcoin.co/grants/1707/llama-treasury-management-for-daos)
- [Llama Raises $6M (Blockworks)](https://blockworks.co/news/dao-governance-vc-investments)
- [Coinbooks Raises $3.2M (The Block)](https://www.theblock.co/linked/138356/coinbooks-raises-3-2-million-to-build-accounting-software-for-daos)
- [Layerup on Y Combinator](https://www.ycombinator.com/companies/layerup)

### Solana Treasury Ecosystem
- [Best Treasury Management Tools on Solana (Solana Compass)](https://solanacompass.com/projects/category/governance/treasury)
- [DAO Tools on Solana (Alchemy)](https://www.alchemy.com/dapps/list-of/dao-tools-on-solana)
- [Realms (realms.today)](https://realms.today/)
- [Realms Documentation](https://docs.realms.today/)
- [Streamflow Finance](https://streamflow.finance/)
- [Snowflake Multisig](https://snowflake.so/)
- [Multisig Wallets on Solana (Alchemy)](https://www.alchemy.com/dapps/list-of/multisig-wallets-on-solana)

### Crypto Accounting
- [Best Crypto Accounting Tools 2025 (Breezing)](https://breezing.io/blog/best-crypto-accounting-subledger-tools-2025/)
- [Best Blockchain Accounting Software (CFO Club)](https://thecfoclub.com/tools/best-blockchain-accounting-software/)
- [Cryptio Review (Milk Road)](https://milkroad.com/reviews/cryptio/)
- [Bitwave Review (Milk Road)](https://milkroad.com/reviews/bitwave/)
- [TRES Finance Review (Milk Road)](https://milkroad.com/reviews/tres-finance/)
- [Cryptio vs TRES Finance (TRES Finance)](https://tres.finance/cryptio-vs-tres-finance-whos-leading-the-2025-accounting-race/)

### Traditional Accounting
- [QuickBooks vs Xero for Crypto (Cryptoworth)](https://blog.cryptoworth.com/quickbooks-vs-xero-crypto-integration-comparison/)
- [QuickBooks Crypto Accounting (SoftLedger)](https://softledger.com/blog/quickbooks-crypto-accounting-what-you-need-to-know/)
- [Xero Crypto Accounting (eCloud Experts)](https://ecloud-experts.com/xero-crypto-accounting/)

### Industry Analysis
- [DAO Tools 2025 Platform Guide (Yellow.com)](https://yellow.com/learn/what-are-dao-tools-and-how-to-choose-2025-platform-guide-for-governance-and-treasury-management)
- [DAOtimes DAO Tool Report 2025](https://daotimes.com/daotimes-dao-tool-report-for-2025/)
- [Current State of DAO Treasury Management (ExaGroup)](https://medium.com/exa-group/current-state-of-dao-treasury-management-a-defipunk-approach-1b3fffb2ce94)
- [DAO Treasury Holdings Statistics 2025 (CoinLaw)](https://coinlaw.io/dao-treasury-holdings-statistics/)
- [5 DAO Treasury Rules (Nexumo)](https://medium.com/@Nexumo_/5-dao-treasury-rules-that-stop-silent-erosion-cfed184f5c8c)
- [DAO Treasury Management (Metana)](https://metana.io/blog/dao-treasury-management/)
- [10 Best DAO Tools (Securities.io)](https://www.securities.io/10-best-tools-built-for-the-dao/)
- [DAO Treasury/Balance Sheet Management (Blockchain Capital)](https://medium.com/blockchain-capital-blog/dao-treasury-balance-sheet-management-ce5e96da34ac)
