# SODA Token -- Solana SPL Deployment Plan

**Date:** February 15, 2026
**Status:** CLI Installed, Devnet Configured, Awaiting User Approval for Token Mint
**Network:** Solana Devnet (NO mainnet operations without explicit approval)

---

## 1. Installation Summary

### What Was Installed

| Tool | Version | Location |
|------|---------|----------|
| solana-cli (Agave) | 3.0.15 | `C:\Users\mic\.local\share\solana\install\bin\` |
| solana-keygen | 3.0.15 | (same directory) |
| spl-token-cli | 5.4.0 | (same directory) |

**Installation method:** Pre-built Windows MSVC binaries from `https://release.anza.xyz/stable/`
**PATH:** Added to `~/.bashrc` for Git Bash sessions.

### Solana Configuration

```
Config File:    C:\Users\mic\.config\solana\cli\config.yml
RPC URL:        https://api.devnet.solana.com
WebSocket URL:  wss://api.devnet.solana.com/
Keypair Path:   C:/Users/mic/.config/solana/soda-dao/treasury-keypair.json
Commitment:     confirmed
```

### Keypairs Created

| Purpose | Public Key | File |
|---------|------------|------|
| Treasury | `7MGbm5DmQ3xoyVA6zVrXVv7VvBDkL5EEQdYrpPUcEWNB` | `~/.config/solana/soda-dao/treasury-keypair.json` |
| Mint Authority | `6YJb2PkChtHu2jYULkss8AMv4m5BNQgtmhYGf9efK4Qh` | `~/.config/solana/soda-dao/mint-authority-keypair.json` |

**IMPORTANT:** Private key files are stored locally. Back them up securely. Never share or commit them.

### Devnet SOL

The devnet faucet was rate-limited at time of setup. To get devnet SOL:
1. Visit https://faucet.solana.com
2. Paste address: `7MGbm5DmQ3xoyVA6zVrXVv7VvBDkL5EEQdYrpPUcEWNB`
3. Request 2+ SOL (needed for token creation and account rent)
4. Or retry CLI: `solana airdrop 2`

---

## 2. SODA Token Specification

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Name | SODA | SodaWorld DAO governance and utility token |
| Symbol | SODA | Matches existing `token_symbol` in DAO settings |
| Total Supply | 100,000,000 | Matches existing `total_supply` in DAO settings |
| Decimals | 6 | Solana standard (allows 0.000001 precision) |
| Token Standard | SPL Token (classic) | See Section 3 for Token-2022 analysis |
| Mint Authority | Retained initially, transfer to Squads multisig before mainnet |
| Freeze Authority | Set initially, revoke before public sale |

---

## 3. Token Standard Decision: SPL Token vs Token-2022

### SPL Token (Classic) -- RECOMMENDED for initial deployment

**Advantages:**
- Universal wallet support (Phantom, Solflare, Backpack, all wallets)
- Indexed by all explorers (Solscan, Solana Explorer, SolanaFM)
- Listed on all DEXes (Jupiter, Raydium, Orca) without issues
- Battle-tested since Solana genesis
- Simpler integration with existing tooling

**Disadvantages:**
- No built-in transfer fees
- Metadata requires separate Metaplex Token Metadata program
- No transfer hooks

### Token-2022 (Token Extensions)

**Advantages:**
- Built-in transfer fees (useful for DAO revenue)
- Native metadata (no Metaplex dependency)
- Transfer hooks (programmable logic on every transfer)
- Confidential transfers
- Non-transferable "soulbound" tokens possible

**Disadvantages:**
- Incomplete DEX support (some Jupiter routes may not work)
- Indexing gaps on Solscan and other explorers
- Some wallets show display issues
- Newer, less battle-tested
- Higher complexity

### Recommendation

**Start with classic SPL Token.** The ecosystem compatibility advantages outweigh Token-2022's features at this stage. Transfer fees and hooks can be implemented at the application layer (marketplace fees, staking contracts). If needed later, a migration can be planned.

---

## 4. Devnet Deployment Steps

These are the exact CLI commands for devnet deployment. **Do NOT execute these without user approval.**

### Step 1: Fund the Treasury Wallet

```bash
# Ensure PATH is set
export PATH="/c/Users/mic/.local/share/solana/install/bin:$PATH"

# Get devnet SOL (or use https://faucet.solana.com)
solana airdrop 2

# Verify balance
solana balance
```

### Step 2: Create the SODA Token Mint

```bash
# Create the token mint with 6 decimals
# --mint-authority sets who can mint tokens
# --decimals 6 is standard for Solana
spl-token create-token \
  --decimals 6 \
  --mint-authority /c/Users/mic/.config/solana/soda-dao/mint-authority-keypair.json

# Save the output mint address -- this IS the token contract address
# Example output: Creating token AbC123...
```

### Step 3: Add Token Metadata (via Metaplex)

Token metadata (name, symbol, URI) requires the Metaplex Token Metadata program. For CLI-based metadata, use `metaboss` or the Metaplex JS SDK:

```bash
# Option A: Using metaboss CLI (install separately)
# cargo install metaboss (requires Rust)

# Option B: Using @metaplex-foundation/js (Node.js script)
# See Section 8 for the Node.js integration script
```

Metadata JSON to host (IPFS or Arweave):
```json
{
  "name": "SODA",
  "symbol": "SODA",
  "description": "SodaWorld DAO governance and utility token",
  "image": "https://[hosted-image-url]/soda-logo.png",
  "external_url": "https://sodaworld.io",
  "attributes": [
    { "trait_type": "Total Supply", "value": "100000000" },
    { "trait_type": "Decimals", "value": "6" },
    { "trait_type": "Category", "value": "Governance" }
  ]
}
```

### Step 4: Create Token Accounts for Allocation Pools

```bash
# Create Associated Token Account (ATA) for treasury (auto-created on first mint)
spl-token create-account <MINT_ADDRESS>

# Create separate keypairs for each allocation pool
solana-keygen new --outfile ~/.config/solana/soda-dao/pool-core-team.json --no-bip39-passphrase
solana-keygen new --outfile ~/.config/solana/soda-dao/pool-advisors.json --no-bip39-passphrase
solana-keygen new --outfile ~/.config/solana/soda-dao/pool-community.json --no-bip39-passphrase
solana-keygen new --outfile ~/.config/solana/soda-dao/pool-reserve.json --no-bip39-passphrase
solana-keygen new --outfile ~/.config/solana/soda-dao/pool-investors.json --no-bip39-passphrase
solana-keygen new --outfile ~/.config/solana/soda-dao/pool-public-sale.json --no-bip39-passphrase
```

### Step 5: Mint Total Supply to Treasury

```bash
# Mint 100,000,000 SODA to treasury
# Uses the mint-authority keypair to authorize
spl-token mint <MINT_ADDRESS> 100000000 \
  --mint-authority /c/Users/mic/.config/solana/soda-dao/mint-authority-keypair.json

# Verify
spl-token supply <MINT_ADDRESS>
spl-token balance <MINT_ADDRESS>
```

### Step 6: Distribute to Allocation Pools

```bash
# Transfer to each pool account (create ATAs first)
spl-token transfer <MINT_ADDRESS> 20000000 <CORE_TEAM_ADDRESS> --fund-recipient
spl-token transfer <MINT_ADDRESS> 5000000  <ADVISORS_ADDRESS>  --fund-recipient
spl-token transfer <MINT_ADDRESS> 35000000 <COMMUNITY_ADDRESS> --fund-recipient
spl-token transfer <MINT_ADDRESS> 20000000 <RESERVE_ADDRESS>   --fund-recipient
spl-token transfer <MINT_ADDRESS> 10000000 <INVESTORS_ADDRESS>  --fund-recipient
spl-token transfer <MINT_ADDRESS> 10000000 <PUBLIC_SALE_ADDRESS> --fund-recipient

# Verify all balances
spl-token accounts
```

### Step 7: Authority Management

```bash
# After distribution is verified, consider:

# Option A: Revoke mint authority (no more tokens can ever be minted)
spl-token authorize <MINT_ADDRESS> mint --disable

# Option B: Transfer mint authority to Squads multisig (recommended)
spl-token authorize <MINT_ADDRESS> mint <SQUADS_MULTISIG_ADDRESS>

# Revoke freeze authority (prevents anyone from freezing token accounts)
spl-token authorize <MINT_ADDRESS> freeze --disable
```

---

## 5. Token Allocation

Aligned with the research in `RESEARCH_TOKEN_DISTRIBUTION.md`:

```
Total Supply: 100,000,000 SODA

Pool              Tokens       %    Vesting Schedule
----              ------      ---   ----------------
Core Team         20,000,000  20%   12-month cliff, 48-month linear
Advisors           5,000,000   5%   6-month cliff, 24-month linear
Community         35,000,000  35%   Milestone-based + retroactive airdrops
Treasury Reserve  20,000,000  20%   Operational + strategic (council-governed)
Investors         10,000,000  10%   6-month cliff, 24-month linear
Public Sale       10,000,000  10%   LBP fair launch (Raydium/Jupiter)
```

### Initial Member Token Holdings (from seed data)

| Member | Role | Tokens | Pool |
|--------|------|--------|------|
| Marcus Chen | CTO / Founder | 4,000,000 | Core Team |
| Sarah Williams | CEO / Founder | 4,000,000 | Core Team |
| James Wright | Creative Director / Founder | 3,000,000 | Core Team |
| Lisa Park | Legal Advisor | 2,000,000 | Advisors |
| David Kumar | Blockchain Advisor | 1,500,000 | Advisors |
| Emma Rodriguez | Lead Developer | 1,000,000 | Community |
| Alex Thompson | Community Manager | 500,000 | Community |
| Mia Foster | First Born Investor | 500,000 | Investors |
| Noah Baker | Non-voting Investor | 250,000 | Investors |
| **Allocated** | | **16,750,000** | |
| **Unallocated** | | **83,250,000** | |

---

## 6. Mainnet Deployment Considerations

### Cost Estimate

| Operation | SOL Cost | Notes |
|-----------|----------|-------|
| Token mint creation | ~0.0015 SOL | Rent-exempt deposit for mint account |
| Each token account (ATA) | ~0.002 SOL | Rent-exempt deposit per account |
| Token metadata (Metaplex) | ~0.01 SOL | Metadata account rent |
| Mint transaction | ~0.000005 SOL | Transaction fee |
| Transfer transactions (x6) | ~0.00003 SOL | Transaction fees |
| **Total estimated** | **~0.05 SOL** | Approximately $7-15 USD at current prices |

Solana's rent model: accounts must hold enough SOL to be "rent-exempt" (covers ~2 years of storage). This SOL is refundable if accounts are closed later.

### Multisig via Squads Protocol

Before mainnet launch, the mint authority should be transferred to a Squads multisig:

1. Create a Squad at https://squads.xyz with the 3 founders as members
2. Set threshold to 2-of-3 for token operations
3. Transfer mint authority from the keypair to the Squad vault address
4. All future minting requires multisig approval
5. Squads V4 supports time locks and spending limits

### Token Metadata via Metaplex

- Use the Metaplex Token Metadata standard (program ID: `metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s`)
- Host metadata JSON and logo on IPFS (Pinata) or Arweave (permanent)
- On-chain metadata includes: name, symbol, URI pointing to off-chain JSON
- Enables proper display in Phantom, Solscan, Jupiter, etc.

### DEX Listing: Jupiter and Raydium

**Raydium (Liquidity Pool):**
- Permissionless -- anyone can create a pool
- Create a SODA/SOL or SODA/USDC concentrated liquidity pool
- Recommended initial liquidity: $15K-50K for credibility
- No listing fee (it is a permissionless protocol)

**Jupiter (Aggregator):**
- Jupiter aggregates across all Solana DEXes
- Once a Raydium pool exists with sufficient liquidity, Jupiter automatically indexes it
- For verified token status, submit to Jupiter's token list via their GitHub
- Requires: token metadata, website, social links, community

**Listing Checklist:**
1. Token metadata properly set (name, symbol, logo)
2. Liquidity pool created on Raydium with initial depth
3. Token verified on Solscan (submit via Solscan verification form)
4. Submit to Jupiter Verified Token List (GitHub PR)
5. Submit to CoinGecko / CoinMarketCap for tracking

---

## 7. Vesting on Solana

### Streamflow (Recommended)

Streamflow is the leading token vesting platform on Solana, listed in official Solana documentation.

**Features:**
- Lock and gradually release tokens over time
- Batch distribution automation
- Price-based vesting models
- Real-time dashboards for token management
- Audited smart contracts

**How to use for SODA:**
1. Go to https://app.streamflow.finance
2. Connect wallet holding pool tokens
3. Create vesting contracts for each allocation:
   - Core Team: 12-month cliff, 48-month linear
   - Advisors: 6-month cliff, 24-month linear
   - Investors: 6-month cliff, 24-month linear
4. Recipients can claim vested tokens through the Streamflow UI

**Cost:** Streamflow charges a small fee per vesting contract creation.

### Bonfida Token Vesting (Alternative)

- Open-source vesting contract on Solana
- GitHub: `github.com/Bonfida/token-vesting`
- Simpler: deposit X SPL tokens, unlock at specified slot height
- Less feature-rich but fully transparent and auditable

### Custom Vesting via Anchor

For maximum control, a custom Anchor program can implement:
- Cliff + linear vesting
- Milestone-based unlocks (using oracle for off-chain milestones)
- Acceleration clauses (single-trigger, double-trigger)
- veSODA governance staking integration

This is recommended for Phase 3 when the project needs custom vesting logic tied to the DAO's governance system.

---

## 8. Integration with SodaWorld Backend

### Required NPM Packages

```bash
npm install @solana/web3.js @solana/spl-token @metaplex-foundation/js
```

| Package | Purpose |
|---------|---------|
| `@solana/web3.js` | Core Solana interaction (RPC, transactions, accounts) |
| `@solana/spl-token` | SPL token operations (balances, transfers, mint info) |
| `@metaplex-foundation/js` | Token metadata creation and reading |

### Reading On-Chain Token Balances

```typescript
import { Connection, PublicKey } from '@solana/web3.js';
import { getAccount, getAssociatedTokenAddress } from '@solana/spl-token';

const connection = new Connection('https://api.devnet.solana.com');
const SODA_MINT = new PublicKey('<MINT_ADDRESS>');

async function getSODABalance(walletAddress: string): Promise<number> {
  const wallet = new PublicKey(walletAddress);
  const ata = await getAssociatedTokenAddress(SODA_MINT, wallet);
  try {
    const account = await getAccount(connection, ata);
    return Number(account.amount) / 1_000_000; // 6 decimals
  } catch {
    return 0; // No token account = 0 balance
  }
}
```

### Backend API Route (for existing pia-system)

```typescript
// New route: GET /api/dao/token/balance/:walletAddress
router.get('/token/balance/:walletAddress', async (req, res) => {
  const { walletAddress } = req.params;
  const balance = await getSODABalance(walletAddress);
  res.json({ wallet: walletAddress, token: 'SODA', balance });
});

// New route: GET /api/dao/token/info
router.get('/token/info', async (req, res) => {
  const mintInfo = await getMint(connection, SODA_MINT);
  res.json({
    mint: SODA_MINT.toBase58(),
    supply: Number(mintInfo.supply) / 1_000_000,
    decimals: mintInfo.decimals,
    mintAuthority: mintInfo.mintAuthority?.toBase58() || 'revoked',
    freezeAuthority: mintInfo.freezeAuthority?.toBase58() || 'revoked',
  });
});
```

### Wallet Connection Flow (Frontend)

```typescript
// For Phantom wallet integration
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';

// Supported wallets
const wallets = [
  new PhantomWalletAdapter(),
  // new SolflareWalletAdapter(),
  // new BackpackWalletAdapter(),
];

// User flow:
// 1. User clicks "Connect Wallet" in SodaWorld UI
// 2. Phantom/Solflare popup requests approval
// 3. On approval, frontend gets wallet public key
// 4. Backend links wallet address to user account (users.wallet_address)
// 5. Backend can now query on-chain SODA balance for that user
// 6. DAO voting weight can be derived from on-chain balance
```

### Database Schema Updates Needed

```sql
-- Add wallet_address to users table (already exists but null)
-- UPDATE users SET wallet_address = '<solana-address>' WHERE id = 'user-marcus';

-- New table for on-chain token tracking
CREATE TABLE IF NOT EXISTS token_on_chain (
  id TEXT PRIMARY KEY,
  mint_address TEXT NOT NULL,        -- SODA mint address
  network TEXT DEFAULT 'devnet',      -- devnet | mainnet-beta
  pool_name TEXT,                     -- core_team | advisors | community | etc.
  pool_address TEXT,                  -- Solana address of pool token account
  expected_balance REAL,              -- Expected token balance
  last_verified_balance REAL,         -- Last checked on-chain balance
  last_verified_at TEXT,              -- Timestamp of last check
  created_at TEXT DEFAULT (datetime('now'))
);
```

---

## 9. Security Checklist

### Before Devnet Testing
- [x] CLI installed and configured for devnet
- [x] Treasury keypair created
- [x] Mint authority keypair created (separate from treasury)
- [ ] Devnet SOL funded (use https://faucet.solana.com)
- [ ] Keypair files backed up to secure location

### Before Mainnet Deployment
- [ ] All devnet testing complete and verified
- [ ] Token metadata finalized (name, symbol, logo hosted on IPFS/Arweave)
- [ ] Squads multisig created with founder members
- [ ] Mint authority transferred to Squads multisig
- [ ] Freeze authority decision made (revoke recommended)
- [ ] Allocation distribution verified
- [ ] Vesting contracts set up (Streamflow)
- [ ] Solscan verification submitted
- [ ] Jupiter token list PR submitted
- [ ] Backend integration tested
- [ ] Legal review complete

### Key Security Rules
- NEVER share or commit private key files (`.json` keypairs)
- NEVER deploy to mainnet without multisig in place
- NEVER revoke mint authority until all planned minting is complete
- Use hardware wallet (Ledger) for mainnet treasury operations
- Implement 2-of-3 multisig minimum for all authority operations

---

## 10. What Still Needs To Be Done

### Immediate (User Action Required)

1. **Get devnet SOL:** Visit https://faucet.solana.com and fund the treasury address
2. **Approve devnet token creation:** Say "go" to execute Steps 2-6 on devnet
3. **Prepare token logo:** PNG image for SODA token (recommended: 512x512px)
4. **Add Solana to Windows PATH:** For cmd/PowerShell access, add `C:\Users\mic\.local\share\solana\install\bin` to system PATH via System Environment Variables

### Short-Term (After Devnet Approval)

5. Create SODA token mint on devnet
6. Set up token metadata with logo
7. Mint 100M tokens and distribute to pool accounts
8. Test balance queries from backend
9. Install `@solana/web3.js` and `@solana/spl-token` in pia-system

### Medium-Term (Before Mainnet)

10. Set up Squads multisig with founder members
11. Create Streamflow vesting contracts for each pool
12. Host token metadata JSON + logo on IPFS (Pinata) or Arweave
13. Fund mainnet treasury wallet with ~0.1 SOL (sufficient for all operations)
14. Deploy to mainnet-beta
15. Verify on Solscan, submit to Jupiter token list

### Long-Term (Post-Launch)

16. Create Raydium liquidity pool for SODA/SOL
17. Frontend wallet connection (Phantom adapter)
18. On-chain governance integration (veSODA model)
19. Custom Anchor vesting program (if Streamflow insufficient)
20. Token-2022 migration evaluation (if transfer fees needed)

---

## Appendix A: Quick Reference Commands

```bash
# Set PATH (Git Bash)
export PATH="/c/Users/mic/.local/share/solana/install/bin:$PATH"

# Check config
solana config get

# Switch networks
solana config set --url devnet          # testing
solana config set --url mainnet-beta    # production (DO NOT USE without approval)

# Check balance
solana balance

# Get address
solana address

# Create token (devnet)
spl-token create-token --decimals 6

# Mint tokens
spl-token mint <MINT> <AMOUNT>

# Check token supply
spl-token supply <MINT>

# Check all token accounts
spl-token accounts

# Transfer tokens
spl-token transfer <MINT> <AMOUNT> <RECIPIENT> --fund-recipient

# Check authority
spl-token display <MINT>
```

## Appendix B: File Locations

```
Keypairs (SENSITIVE -- never share):
  C:\Users\mic\.config\solana\soda-dao\treasury-keypair.json
  C:\Users\mic\.config\solana\soda-dao\mint-authority-keypair.json

Solana Config:
  C:\Users\mic\.config\solana\cli\config.yml

Solana CLI Binaries:
  C:\Users\mic\.local\share\solana\install\bin\

This Plan:
  C:\Users\mic\Downloads\pia-system\dao-foundation-files\SOLANA_SODA_TOKEN_PLAN.md

Related Research:
  C:\Users\mic\Downloads\pia-system\dao-foundation-files\research\RESEARCH_TOKEN_DISTRIBUTION.md
  C:\Users\mic\Downloads\pia-system\dao-foundation-files\research\RESEARCH_TREASURY.md
```

---

*Generated 2026-02-15. All operations are on Solana DEVNET. No mainnet transactions have been executed. No real SOL has been spent.*
