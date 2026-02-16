# Agreements & Signatures Research: SodaWorld DAO

**Date:** 2026-02-15
**Scope:** Comprehensive research for the Agreements & Signatures component of SodaWorld DAO
**Current State:** Founder agreements, advisor agreements, contributor agreements, cryptographic signatures with witness co-signatures

---

## Table of Contents

1. [DAO Legal Agreement Platforms (Syndicate, Otonomos, LexDAO)](#1-dao-legal-agreement-platforms)
2. [Smart Contract-Based Agreements (ERC-721 NFTs, On-Chain Attestations)](#2-smart-contract-based-agreements)
3. [Ethereum Attestation Service (EAS)](#3-ethereum-attestation-service)
4. [Digital Signature Standards in Web3](#4-digital-signature-standards-in-web3)
5. [Vesting Agreement Patterns](#5-vesting-agreement-patterns)
6. [Contributor Agreements in DAOs](#6-contributor-agreements-in-daos)
7. [Advisor Agreement Best Practices](#7-advisor-agreement-best-practices)
8. [DAO Legal Wrappers](#8-dao-legal-wrappers)
9. [Dispute Resolution in DAOs](#9-dispute-resolution-in-daos)
10. [KYC/AML Compliance for DAO Members](#10-kycaml-compliance-for-dao-members)

---

## 1. DAO Legal Agreement Platforms

### 1.1 Syndicate

**What it is:** Syndicate is a Web3 investment infrastructure platform that transforms any Ethereum wallet into an investing DAO. It provides tooling for legal formation, cap table management, and governance token issuance.

**How it works technically:**
- Deploys smart contracts that give wallets "web3 investing superpowers" including on-chain deposit management and cap tables ("mirrortables")
- Issues governance tokens ("mirrorshares") as ERC-20 tokens, making them composable with any DAO or Web3 tool (Snapshot, Gnosis, Coordinape, Guild)
- Partners with law firm Latham & Watkins for legal templates embedded directly in the product
- Partnered with doola to enable DAOs to get legal entities (LLCs), open fiat bank accounts, submit state compliance filings, and issue K-1 tax forms
- Supports groups of up to 99 participants who pool capital and vote on investments

**Who uses it:** Investment DAOs, Web3 investment clubs, token-gated communities

**SodaWorld Recommendation:** Adopt Syndicate's model of embedding legal templates directly into the platform. SodaWorld already has a Legal AI module -- extend it to auto-generate compliant agreement documents (operating agreements, contributor agreements) with pre-approved clause libraries. The mirrortable concept (ERC-20 based cap table) maps well to SodaWorld's token allocation tracking for founders, advisors, and contributors.

### 1.2 Otonomos (OtoCo)

**What it is:** Otonomos is an entity assembler that helps blockchain-native organisations fit DAOs into multi-jurisdictional entity structures. They pioneered on-chain company formation.

**How it works technically:**
- Deployed a DAO smart contract that allows users to form a legal entity on-chain (no PDF signing)
- Operating agreements are embedded in smart contract code rather than signed PDFs
- Funding flows are on-chain and automated; shares are tokenized
- Supports on-chain formation for Delaware and Wyoming Series LLCs (400+ users)
- Introduced the (D)UNA -- a US legal structure for DAOs providing limited liability, token issuance, and on-chain governance
- Supports the RAK DAO Association Regime (DARe) in the UAE free trade zone

**Who uses it:** Protocol DAOs, DeFi projects, blockchain startups needing multi-jurisdictional presence

**SodaWorld Recommendation:** Study Otonomos's approach to embedding operating agreements in code rather than PDFs. SodaWorld's `agreements` table stores `content_markdown` -- consider adding a structured `agreement_code` field that maps agreement terms to enforceable on-chain parameters. For example, vesting schedules stored in `terms.vesting` should directly correspond to a smart contract's vesting logic, creating a "code is law" bridge between the legal text and execution.

### 1.3 LexDAO

**What it is:** LexDAO is a guild of legal engineering professionals that builds blockchain protocols securing rules and promises with code rather than trust. They maintain the LexCorpus repository of building-block contracts.

**How it works technically:**
- LexCorpus repository includes: tokenized LLC toolkit using Delaware Series LLC, NFT minter, governance contracts, ETH/ERC-20/NFT Escrow with integrated arbitration and legal wrappers
- LexLocker: escrow contract for digital dealings with built-in dispute resolution
- Trained and certified "legal engineers" who bridge law and code
- Focus on lean contract code for security and legibility
- Smart contracts manage terms, conditions, and payments between parties

**Who uses it:** DAOs needing legal-grade smart contracts, legal engineers, projects needing arbitration-enabled escrow

**SodaWorld Recommendation:** Integrate LexDAO's escrow pattern for SodaWorld's agreement execution. When a contributor agreement includes token grants with milestones, funds should be locked in an escrow contract (similar to LexLocker) that releases tokens only when milestone attestations are verified. The existing `milestones` table in the SodaWorld database already tracks `council_member_id` milestones -- connect this to an on-chain escrow release mechanism.

---

## 2. Smart Contract-Based Agreements

### 2.1 ERC-721 Agreement NFTs

**What it is:** Using the ERC-721 non-fungible token standard to represent legal agreements as unique, on-chain assets. Each agreement becomes a distinct token with metadata containing the agreement terms, parties, and status.

**How it works technically:**
- Each agreement is minted as a unique NFT with a token ID corresponding to the agreement ID
- Metadata (stored on IPFS or Arweave) includes: agreement text hash, party addresses, effective date, status, version
- Transfer of the NFT can represent assignment of agreement rights
- TributeDAO's NFT adapter allows members to contribute ERC-721 tokens to a DAO in exchange for internal DAO tokens
- Agreement status changes (draft -> active -> terminated) are on-chain state transitions

**Who uses it:** TributeDAO, NFT-gated DAOs, projects using NFTs for membership/voting

**SodaWorld Recommendation:** Mint each active agreement as an NFT, but use the Soulbound Token (SBT) variant (see below) to prevent transfer. Store the agreement hash on-chain and the full content on IPFS. This creates an immutable record that the agreement existed at a specific time with specific terms, while the SodaWorld database remains the primary interface for agreement management.

### 2.2 Soulbound Tokens (SBTs) for Agreements

**What it is:** Non-transferable NFTs (proposed by Vitalik Buterin) that represent credentials, affiliations, or commitments bound permanently to a single wallet address. Standards include EIP-4973 (Account-Bound Tokens) and EIP-5192 (Minimal Soulbound NFTs).

**How it works technically:**
- SBTs use ERC-721 or ERC-1155 compatible contracts with transfer functions disabled or restricted
- EIP-5192 adds a `locked()` function that returns true, indicating the token cannot be transferred
- A trusted issuer (the DAO) mints the SBT to the member's address
- Third parties can verify the credential on-chain without contacting the issuer
- Prevents Sybil attacks on DAOs by ensuring voting rights remain with genuine community members
- Cannot be purchased or traded, making them pure credential tokens

**Who uses it:** Binance (BAB token for KYC'd users), Optimism (citizenship badges), various DAOs for membership proof

**SodaWorld Recommendation:** Implement a `SodaWorldAgreementSBT` contract (EIP-5192) that mints a non-transferable token to each party when an agreement reaches `active` status. The SBT metadata includes the agreement type, role (founder/advisor/contributor), effective date, and a hash of the full agreement text. This creates an on-chain, non-tradeable record of each member's commitment. When an agreement is `terminated`, the SBT is burned or its `locked` status is updated. This directly enhances the existing `AgreementSignature` type in the codebase.

### 2.3 Hats Protocol for Role-Based Agreements

**What it is:** Hats Protocol provides DAO-native roles and credentials as revocable, non-transferable ERC-1155 tokens organized in tree structures. Trusted by 50+ top DAOs.

**How it works technically:**
- Roles ("hats") are ERC-1155 tokens held by Ethereum accounts
- When an address holds a balance of 1 for a given Hat token, it is a "wearer" with associated authorities
- Hats are organized in tree structures: top-level hat -> sub-hats for departments -> individual roles
- Authorities bundled with hats include: multisig signing rights, GitHub admin access, voting powers, budget control, communication channel access
- Hats are granted/revoked by the organization or designated smart contracts
- Wearers can renounce a hat but cannot transfer it

**Who uses it:** 50+ DAOs including major protocol DAOs for operational role management

**SodaWorld Recommendation:** Layer Hats Protocol on top of the agreement system. When a founder agreement is activated, the founder receives a "Founder Hat" SBT that grants specific permissions (treasury multisig signing, governance proposal creation). When an advisor agreement activates, the advisor gets an "Advisor Hat" with different permissions (knowledge base access, review rights but no spending authority). This maps cleanly to SodaWorld's existing `UserRole` types: `founder`, `admin`, `member`, `contributor`, `observer`.

---

## 3. Ethereum Attestation Service (EAS)

### 3.1 Overview

**What it is:** EAS is a permissionless, token-free infrastructure public good for making attestations on-chain or off-chain about anything. An attestation is a digitally signed claim by any entity about any subject.

**How it works technically:**

EAS operates with just two smart contracts:

1. **SchemaRegistry.sol** -- Registers attestation schemas (data structure definitions)
2. **EAS.sol** -- Creates attestations that follow registered schemas

**Schema Registration:**
```
Schema: "address member, string role, uint256 tokenGrant, bytes32 agreementHash, bool isActive"
```
- Schemas follow Solidity ABI types (address, uint256, string, bytes32, bool)
- Each schema gets a unique UID
- Optional `resolver` contract can execute additional logic on attestation (e.g., mint an NFT, trigger DAO governance action, process payment)

**Making Attestations:**
- On-chain: Stored on the Ethereum settlement layer, immediately verifiable, costs gas
- Off-chain: Stored on IPFS or privately, cheaper, can be selectively disclosed
- Both types are signed with EIP-712 typed signatures

**Resolver Contracts:**
- Optionally referenced smart contracts that execute additional logic
- Can trigger: payments, NFT minting, DAO governance actions, access control changes
- Enable composability between attestations and other on-chain systems

### 3.2 DAO Membership Attestation Use Cases

- **Membership verification:** "This wallet is an active member of SodaWorld DAO with role=founder"
- **Agreement signing attestation:** "This wallet signed agreement X at timestamp Y with hash Z"
- **Milestone completion:** "Contributor X completed milestone Y, verified by witnesses A and B"
- **KYC attestation:** "This wallet has completed identity verification" (without revealing personal data)
- **Reputation:** "This member has contributed to 5 proposals, 3 bounties, and 2 code reviews"

### 3.3 On-Chain vs Off-Chain Trade-offs

| Aspect | On-Chain | Off-Chain |
|--------|----------|-----------|
| Cost | Gas fees per attestation | Free (storage costs only) |
| Verifiability | Instant, trustless | Requires fetching from storage |
| Privacy | Public | Can be private/selective |
| Composability | Direct smart contract interaction | Requires bridging |
| Best for | Agreements, role changes, votes | KYC, reputation, internal records |

**Who uses it:** Optimism (governance attestations), Coinbase (verified account attestations), Gitcoin (Passport stamps), various DAOs for membership credentials

**SodaWorld Recommendation:** Deploy a SodaWorld-specific EAS schema for agreement attestations:

```
Schema: "bytes32 agreementId, address signer, string signerType, string agreementType, bytes32 contentHash, uint256 timestamp, address[] witnesses"
```

When any agreement in the `agreements` table transitions to `pending_signatures`, create the EAS schema. When each party signs (using the existing `/api/signatures/sign` endpoint), create an on-chain attestation. When all required signatures are collected, a resolver contract automatically transitions the agreement to `active` status and mints the SBT. Use off-chain attestations for internal milestones and reputation tracking to save gas costs.

---

## 4. Digital Signature Standards in Web3

### 4.1 EIP-191: Signed Data Standard

**What it is:** The foundational specification for how signed data should be structured in Ethereum. It standardizes what signed data looks like.

**How it works technically:**
- Prefixes messages with `\x19Ethereum Signed Message:\n` followed by message length
- Prevents signed messages from being replayed as valid Ethereum transactions
- Produces human-readable messages that wallets display before signing
- The signed message is: `0x19 <version byte> <version specific data> <data to sign>`
- Version byte `0x45` = personal_sign (most common for simple messages)

**Who uses it:** MetaMask personal_sign, most Web3 dApps for simple message signing

### 4.2 EIP-712: Typed Structured Data Signing

**What it is:** The advanced standard for hashing and signing typed structured data, enabling wallets to display data in a structured, human-readable, and machine-verifiable format.

**How it works technically:**
- Defines a domain separator that prevents signature replay across different dApps/chains:
  ```
  {
    name: "SodaWorld DAO",
    version: "1",
    chainId: 1,
    verifyingContract: "0x..."
  }
  ```
- Structures data with explicit types:
  ```
  AgreementSignature {
    agreementId: bytes32,
    signerAddress: address,
    signerType: string,
    contentHash: bytes32,
    timestamp: uint256,
    nonce: uint256
  }
  ```
- Wallets display each field clearly before the user signs
- Version byte `0x01` in EIP-191 encoding
- The domain separator guarantees no signature collision across applications
- Widely supported: MetaMask, Ledger, and most Ethereum ecosystem wallets

**Who uses it:** OpenSea (order signing), Uniswap (permit signatures), Aave, Compound, all major DeFi protocols

### 4.3 EIP-1271: Smart Contract Wallet Signature Verification

**What it is:** A standard method for validating signatures when the signer is a smart contract wallet (like Safe/Gnosis) rather than an externally owned account (EOA).

**How it works technically:**
- Smart contract wallets cannot produce ECDSA signatures natively
- EIP-1271 defines `isValidSignature(bytes32 hash, bytes signature)` function
- The contract checks its internal state (e.g., multi-sig threshold met) and returns a magic value if valid
- Enables asynchronous multi-party signing: different signers can sign at different times
- Once the M-of-N threshold is met, the contract considers the signature valid

**Who uses it:** Safe (Gnosis Safe), Argent, any project supporting smart contract wallets

### 4.4 Multi-Sig Co-Signing with Safe (Gnosis Safe)

**What it is:** Safe is the most battle-tested smart contract wallet infrastructure for teams and DAOs. It requires multiple signatures from designated owners before executing transactions.

**How it works technically:**
- M-of-N configuration (e.g., 2-of-3 for SodaWorld's treasury)
- Smart contract deployed per Safe with owner addresses and threshold
- Transaction flow: Propose -> Owners review and sign individually -> Threshold met -> Auto-execute
- Supports gasless transactions via relayers
- Integrates with governance tools like Tally and Snapshot

**Who uses it:** Uniswap DAO ($2B+ with 4-of-7 Safe), MakerDAO, Aave, virtually all major DAOs

**SodaWorld Recommendation:** The current signature system in `_extracted_signatures.ts` uses a basic `signerType` of "dao" or "member" with Solana signature verification. Upgrade this to a full EIP-712 typed signature system:

1. **Define SodaWorld EIP-712 domain:** Include contract name, version, chain ID, and verifying contract address
2. **Define typed structures:** `AgreementSignature`, `WitnessCoSignature`, `MilestoneAttestation`
3. **Implement witness co-signing:** When a founder signs an agreement, require at least one other founder or the DAO Safe multi-sig to co-sign as witness. This maps to the existing `witness co-signatures` feature.
4. **Support both EOA and Smart Contract wallets:** Verify EIP-712 signatures from personal wallets and EIP-1271 signatures from Safe multi-sig wallets
5. **Add nonce tracking:** Prevent signature replay attacks by incrementing nonces per signer per agreement

---

## 5. Vesting Agreement Patterns

### 5.1 Cliff Vesting

**What it is:** A lockup period at the beginning of a vesting schedule during which no tokens are released. After the cliff, a lump sum or percentage becomes available.

**How it works technically:**
- Typical cliff periods: 3 months (contributors), 6 months (advisors), 12 months (founders)
- After the cliff, tokens either release as a lump sum or begin linear vesting
- Smart contract implementation: `if (block.timestamp < startTime + cliffDuration) return 0;`
- OpenZeppelin's `VestingWallet.sol` provides the base implementation with configurable cliff
- The contract holds tokens in custody and releases based on elapsed time

### 5.2 Linear Vesting

**What it is:** Tokens are released proportionally over time after the cliff period.

**How it works technically:**
- Formula: `vestedAmount = totalAllocation * (elapsedTime - cliffDuration) / (vestingDuration - cliffDuration)`
- OpenZeppelin's `VestingWallet` uses this as the default `vestedAmount()` function
- Beneficiary can call `release()` at any time to claim vested tokens
- Supports both ETH and ERC-20 tokens

### 5.3 Milestone-Based Vesting

**What it is:** Token releases tied to specific achievements rather than time. Best for partnerships, grant programs, and DAO bounties.

**How it works technically:**
- Each milestone is defined with: description, required deliverable, token amount, verifier address
- Verification can be: multi-sig approval, oracle attestation, governance vote, or EAS attestation
- Smart contract holds tokens and releases per-milestone upon verification
- Can be combined with time-based vesting (hybrid): time unlocks base amount, milestones unlock bonuses

### 5.4 Hybrid Vesting (Time + Milestone)

**What it is:** Combines time-based linear vesting with milestone-based bonus unlocks. Considered best practice for DAOs.

**How it works technically:**
- Base allocation vests linearly over time (e.g., 70% of grant)
- Bonus allocation unlocks on milestone completion (e.g., 30% of grant)
- Example for a founder with 4M SODA tokens:
  - 12-month cliff
  - 2.8M (70%) vests linearly over 48 months
  - 1.2M (30%) unlocks across 4 milestones: MVP launch (300K), 1000 users (300K), revenue target (300K), successful audit (300K)

### 5.5 Performance Triggers

**What it is:** Vesting acceleration or deceleration based on measurable performance metrics.

**How it works technically:**
- Acceleration triggers: acquisition event, successful funding round, specific KPIs met
- Deceleration: poor performance review, missed milestones, governance vote
- "Double trigger" acceleration: requires both a change of control AND termination event
- Smart contract oracles can feed performance data to trigger automatic adjustments

**Current SodaWorld State:**
The existing `VestingSchedule` interface supports:
```typescript
{
  total_amount: number;
  token_symbol: string;
  cliff_months: number;
  vesting_months: number;
  unlocks: VestingUnlock[]; // date, percentage, description
}
```

**SodaWorld Recommendation:** Extend the `VestingSchedule` type to support hybrid vesting:

```typescript
interface VestingSchedule {
  total_amount: number;
  token_symbol: string;
  cliff_months: number;
  vesting_months: number;
  vesting_type: 'linear' | 'milestone' | 'hybrid';
  linear_percentage: number;        // e.g., 70 for hybrid
  milestone_percentage: number;     // e.g., 30 for hybrid
  unlocks: VestingUnlock[];
  milestones: VestingMilestone[];   // NEW
  acceleration_triggers: string[];  // NEW
  revocable: boolean;               // NEW
  revocation_conditions: string[];  // NEW
}

interface VestingMilestone {
  id: string;
  description: string;
  token_amount: number;
  verifier_type: 'multisig' | 'governance_vote' | 'oracle' | 'eas_attestation';
  verifier_config: Record<string, unknown>;
  completed: boolean;
  completed_at: string | null;
}
```

Map vesting parameters to an on-chain `VestingWallet` contract (based on OpenZeppelin) extended with milestone verification. The existing `milestones` database table should sync with the smart contract state.

---

## 6. Contributor Agreements in DAOs

### 6.1 Standard Terms

**What it is:** Contributor agreements formalize the relationship between a DAO and its contributors (individuals or organisations providing services, code, design, content, or other deliverables).

**Standard terms include:**

| Term | Description | Industry Standard |
|------|-------------|-------------------|
| Scope of Work | Specific deliverables, roles, and responsibilities | Clearly defined with measurable outputs |
| Compensation | Token grants, stablecoins, or hybrid | Token + stablecoin hybrid preferred |
| IP Assignment | Who owns the work product | All contributions assigned to the DAO |
| Confidentiality | NDA terms | Perpetual for trade secrets, 2-year for general |
| Non-Compete | Post-departure restrictions | 6-12 months, narrowly scoped |
| Termination | How either party can end the relationship | 30-day notice for contributors, 60-day for founders |
| Dispute Resolution | How conflicts are resolved | Arbitration (increasingly on-chain) |
| Vesting | Token unlock schedule | Cliff + linear vesting |
| Representations | Capacity to contract, no conflicts | Standard legal reps and warranties |

### 6.2 IP Assignment Models

Three common approaches:

1. **Full Assignment:** All IP created during engagement belongs to the DAO. Most protective for the DAO. Used by SodaWorld currently.
2. **License Grant:** Contributor retains ownership but grants the DAO a perpetual, irrevocable license. More contributor-friendly.
3. **Open Source Dual License:** Work is open-sourced under a permissive license, but the DAO retains the right to commercialize. Aligns with Web3 ethos.

### 6.3 Rally Legal Template

Rally Legal offers a purpose-built DAO contributor agreement covering: scope of work, multiple payment options, IP assignment, liability limitations, legal recourse for non-payment (contributor) and non-delivery (DAO), and tax simplification.

**Who uses it:** DAOs across the Ethereum ecosystem seeking lightweight but legally sound contributor agreements

**SodaWorld Recommendation:** The existing contributor agreements (Emma Rodriguez, Alex Thompson) include basic terms but lack several standard clauses. Add:

1. **Deliverable specifications:** Link each agreement to specific bounties or tasks in the `bounties` table
2. **Payment waterfall:** Define payment priority (stablecoin base pay + token bonus) rather than pure token compensation
3. **Open-source clause:** Since SodaWorld is building a platform, include an open-source contribution clause that assigns copyright to the DAO while licensing code under a permissive license
4. **Off-boarding procedure:** Define what happens to access, credentials, and pending vesting upon contributor departure
5. **Performance review:** Quarterly reviews tied to milestone-based vesting bonuses (see Section 5.4)

---

## 7. Advisor Agreement Best Practices

### 7.1 Token Allocation Standards

**Industry benchmarks for advisor token allocation:**

| Category | Allocation Range | Typical Vesting |
|----------|-----------------|-----------------|
| Strategic Advisor (high-profile) | 0.5% - 1.0% of total supply | 6-month cliff, 24-month vesting |
| Technical Advisor | 0.25% - 0.5% | 6-month cliff, 24-month vesting |
| Legal/Compliance Advisor | 0.25% - 0.5% | 6-month cliff, 24-month vesting |
| Part-time Advisor | 0.1% - 0.25% | 3-month cliff, 12-month vesting |
| Total Advisor Pool | 5% - 10% of total supply | Varies |

**SodaWorld's current allocation:**
- Lisa Park (Legal Advisor): 2,000,000 SODA = 2.0% of 100M supply
- David Kumar (Blockchain Advisor): 1,500,000 SODA = 1.5% of 100M supply
- Combined advisors: 3.5% -- this is within the normal 5-10% advisor pool

### 7.2 Services Scope Definition

Best practices for defining advisor obligations:

- **Minimum hours commitment:** 5-10 hours/month for standard advisors, 15-20 for strategic advisors
- **Specific deliverables:** "Review 2 agreements per month" rather than "provide legal guidance"
- **Availability requirements:** Response time expectations (e.g., 48-hour response to urgent queries)
- **Board/council participation:** Attendance at monthly governance calls
- **Network access:** Introductions to investors, partners, talent (quantified: "3 introductions per quarter")
- **Exclusivity/non-compete:** Whether the advisor can advise competing DAOs

### 7.3 Lock-Up Periods

**What it is:** Lock-up periods entirely restrict token access until a specific date, distinct from vesting which gradually releases tokens. Many projects combine both.

**Best practice structure:**
- 6-month lock-up (no access whatsoever)
- Then 6-month cliff (vesting begins but no release until cliff)
- Then 12-18 months linear vesting
- Clawback provisions if advisor leaves before full vesting

### 7.4 Termination and Clawback

- **For cause termination:** Immediate cessation of vesting, clawback of unvested tokens
- **Without cause termination:** Accelerated vesting of the next quarter's tokens as severance
- **Change of control:** Double-trigger acceleration (requires both acquisition + advisor termination)
- **Good leaver vs bad leaver:** Good leavers keep vested tokens; bad leavers may forfeit a portion

**SodaWorld Recommendation:** The current advisor agreements (Lisa Park, David Kumar) have:
- 6-month cliff, 24-month vesting -- this follows best practices
- Minimum hours commitment (10h/month for Lisa, 8h/month for David) -- good
- Missing: specific deliverable requirements, clawback provisions, lock-up period, non-compete, performance review triggers

Add a structured `AdvisorTerms` extension to the `AgreementTerms` interface:

```typescript
interface AdvisorTerms extends AgreementTerms {
  minimum_hours_monthly: number;
  specific_deliverables: string[];
  availability_sla_hours: number;     // max response time
  lockup_months: number;              // separate from cliff
  clawback_conditions: string[];
  non_compete_months: number;
  non_compete_scope: string;
  performance_review_frequency: 'monthly' | 'quarterly' | 'semi_annual';
  termination_type: 'for_cause' | 'without_cause' | 'mutual';
  good_leaver_terms: string;
  bad_leaver_terms: string;
}
```

---

## 8. DAO Legal Wrappers

### 8.1 Comparison of Wrapper Types

| Wrapper | Jurisdiction | Liability Protection | Tax Treatment | Token Issuance | Formation Cost | Formation Time | Best For |
|---------|-------------|---------------------|---------------|----------------|---------------|---------------|----------|
| Wyoming DAO LLC | USA (Wyoming) | Yes | Pass-through | Limited | $100 filing | 1-2 weeks | US-based DAOs, simple governance |
| Wyoming DUNA | USA (Wyoming) | Yes | Nonprofit/for-profit | Yes | $15K-50K | 4-8 weeks | 100+ member DAOs, open governance |
| Delaware Series LLC | USA (Delaware) | Yes | Pass-through | Limited | $300-500 filing | 1-2 weeks | Multi-entity DAOs, sub-DAOs |
| Cayman Foundation Company | Cayman Islands | Yes (orphan structure) | No corporate/capital gains tax | Full flexibility | $15K-25K | 1-2 months | Protocol DAOs, token issuance, international |
| Swiss Foundation | Switzerland | Yes | Tax relief for public benefit | Yes (with restrictions) | CHF 50K+ endowment | 3-6 months | Well-funded DAOs, credibility-focused |
| Singapore Foundation | Singapore | Yes | Favorable tax treaties | Yes | $10K-20K | 2-3 months | Asia-Pacific DAOs |
| Marshall Islands DAO LLC | Marshall Islands | Yes | No income tax | Full flexibility | $5K-10K | 2-4 weeks | Maximally decentralized DAOs |
| RAK DAO (UAE) | UAE (RAK) | Yes | No income tax | Yes | Varies | 1-2 months | Middle East-focused DAOs |

### 8.2 Wyoming DUNA (Decentralized Unincorporated Nonprofit Association)

**What it is:** Purpose-built legal framework for DAOs, effective July 1, 2024. The first US statute explicitly designed for decentralized organizations.

**How it works:**
- Requires 100+ members
- Membership based on ownership of a membership interest that grants voting rights
- Voting power proportional to membership interest (maps directly to token holdings)
- Members are NOT personally liable for DAO actions or other members' actions
- Can engage in for-profit activities (e.g., operate a DEX, social protocol)
- Governance can be on-chain
- Backed by a16z crypto research and advocacy

**Key advantage over Wyoming DAO LLC:** The DUNA is designed for truly decentralized organizations with many members, while the DAO LLC works better for smaller, more centralized groups.

### 8.3 Cayman Foundation Company

**What it is:** The most popular legal wrapper for protocol DAOs, especially those issuing tokens. Provides an "orphaned" structure with no shareholders.

**How it works:**
- Can function without members -- only needs one or more supervisors
- The "orphaned" structure resolves the dual ownership challenge (token holders vs legal entity members)
- No corporate income, capital gains, or payroll taxes in the Cayman Islands
- 2x cheaper than Swiss or Singapore foundations
- Robust ring-fencing of assets

**Common multi-entity pattern:**
1. US C-Corp (DevCo) for development -- employs engineers
2. Cayman Foundation for token issuance and governance
3. Optional: BVI entity for IP holding

### 8.4 Entity Stack Pattern

**What it is:** Rather than a single wrapper, DAOs increasingly use a "stack" of entities across jurisdictions for different functions.

**Typical stack:**
- **DevCo** (US Delaware C-Corp): Employs team, holds fiat, manages operations
- **TokenCo** (Cayman Foundation): Issues tokens, manages governance, holds IP
- **DAO** (Wyoming DUNA or unincorporated): On-chain governance layer, member voting
- **Sub-DAOs** (Delaware Series LLC): Project-specific entities for grants, investments

**SodaWorld Recommendation:**

Given SodaWorld's current state (formation phase, Delaware governing law, 9 members, token not yet launched):

**Phase 1 (Now -- Formation):**
- Register as a Wyoming DAO LLC for immediate liability protection (fast, cheap)
- The existing Delaware governing law in agreements can remain for contract disputes
- All current agreements reference "Binding arbitration" which is good

**Phase 2 (Pre-Token Launch):**
- Establish a Cayman Foundation Company for SODA token issuance
- Transfer token-related IP to the Foundation
- The Foundation becomes the legal issuer of SODA tokens

**Phase 3 (Operating -- 100+ members):**
- Consider converting to a Wyoming DUNA for the governance layer
- Token-weighted voting in the DUNA maps directly to SodaWorld's `voting_power` field
- Maintain the Cayman Foundation for token economics

Update the `settings.legal_framework` field in the DAO table from `'US'` to a structured object:

```typescript
interface LegalFramework {
  primary_entity: 'wyoming_dao_llc' | 'wyoming_duna' | 'cayman_foundation' | 'delaware_llc';
  entity_stack: Array<{
    type: string;
    jurisdiction: string;
    purpose: string;
    formation_date: string | null;
    status: 'planned' | 'forming' | 'active' | 'dissolved';
  }>;
  governing_law: string;
  dispute_resolution: string;
}
```

---

## 9. Dispute Resolution in DAOs

### 9.1 Kleros

**What it is:** A decentralized arbitration protocol where crowdsourced jurors stake PNK tokens, are randomly selected, and resolve disputes via commit-reveal voting. Has processed thousands of disputes since 2018.

**How it works technically:**

1. **Dispute Creation:** A party raises a dispute, locking an arbitration fee in the Kleros escrow contract
2. **Juror Selection:** Jurors are randomly drawn via stake-weighted sortition (more PNK staked = higher chance of selection)
3. **Evidence Phase:** Both parties submit evidence (documents, screenshots, attestations) to the case
4. **Commit Phase:** Jurors commit a hash of their vote (commit-reveal prevents herding)
5. **Reveal Phase:** Jurors reveal their votes
6. **Ruling:** Majority vote determines the winner; losing jurors lose a portion of their stake
7. **Appeal:** Any party can appeal, triggering a new round with MORE jurors (increases cost of gaming)

**Smart Contract Integration (ERC-792 Arbitrable standard):**
```solidity
interface IArbitrable {
    function rule(uint256 _disputeID, uint256 _ruling) external;
    event Ruling(IArbitrator indexed _arbitrator, uint256 indexed _disputeID, uint256 _ruling);
}
```

**Kleros Escrow Flow:**
- Sender deposits payment into escrow contract
- If satisfied: release full payment to recipient
- If unsatisfied: negotiate partial payment OR escalate to Kleros court
- Kleros ruling is enforced automatically by the smart contract

**Who uses it:** NFT marketplaces, DeFi escrow services, prediction markets (Reality.eth integration), DAO governance disputes

### 9.2 Aragon Court (Aragon DAO)

**What it is:** Smart contract-based dispute resolution governed by ANT token holders, focused on resolving disputes about DAO governance proposals that may violate the DAO's constitution.

**How it works technically:**
- Jurors stake ANT tokens to earn dispute resolution rights
- Jury formed by stake-weighted sortition when a dispute occurs
- Primary use case: challenging proposals that violate DAO governance rules
- Integrated with Aragon's DAO framework

**Who uses it:** DAOs within the Aragon ecosystem

### 9.3 Hybrid Approach: On-Chain + Traditional Arbitration

**What it is:** Combining on-chain dispute resolution for small/medium disputes with traditional legal arbitration for high-value or complex matters.

**How it works:**
- Disputes under $10K: Resolved via Kleros or internal DAO governance vote
- Disputes $10K-$100K: Mediation via a DAO-designated mediator, escalating to Kleros if unresolved
- Disputes over $100K: Traditional binding arbitration (e.g., JAMS, AAA) with the on-chain ruling as evidence

**SodaWorld Recommendation:**

The current agreements all specify "Binding arbitration" as the dispute resolution method. Enhance this with a tiered system:

```typescript
interface DisputeResolution {
  tier_1: {
    method: 'internal_governance';
    description: 'DAO council vote with 2/3 supermajority';
    max_value_usd: 10000;
    timeline_days: 14;
  };
  tier_2: {
    method: 'kleros_arbitration';
    description: 'Kleros decentralized court with ERC-792 integration';
    max_value_usd: 100000;
    kleros_court_id: string;
    timeline_days: 30;
  };
  tier_3: {
    method: 'traditional_arbitration';
    description: 'Binding arbitration under JAMS rules';
    jurisdiction: 'Delaware, USA';
    timeline_days: 90;
  };
  escalation_rules: string;
}
```

Integrate with Kleros by implementing the ERC-792 `IArbitrable` interface in the agreement escrow contracts. This means token grants tied to milestones can be disputed through Kleros if the contributor and DAO disagree on milestone completion.

---

## 10. KYC/AML Compliance for DAO Members

### 10.1 Regulatory Landscape (2025-2026)

By 2025-2026, regulators globally are pressing for stronger oversight of DeFi and DAOs:
- **US:** FinCEN guidance on DAO treasury reporting; SEC scrutiny of token distributions
- **EU:** MiCA (Markets in Crypto-Assets) regulation requires licensed operations for token issuance
- **UAE:** RAK DAO framework includes built-in KYC requirements
- **Global:** FATF Travel Rule applies to DAOs handling value transfers

### 10.2 Decentralized Identity Solutions

**Polygon ID (now part of World ecosystem):**
- Self-sovereign identity powered by zero-knowledge cryptography
- Users complete KYC once, receive verifiable credentials
- Prove identity on-chain WITHOUT revealing personal data
- DAO membership claims: "This wallet belongs to a verified unique human"
- Sybil resistance: proof-of-uniqueness credential ensures one-person-one-vote regardless of wallet count
- Used by: Uniswap (verified liquidity providers), various DAOs for governance participation

**World ID (Worldcoin):**
- Proof of personhood using biometric verification (iris scan)
- 10M+ registrations across 120+ countries by 2025
- ZK proofs verify "this person is unique" without revealing who they are
- Prevents Sybil attacks at scale
- DAO voting: each verified human gets one vote regardless of token holdings
- Integrating with AI agents and preparing for DAO governance

**Decentralized Identifiers (DIDs):**
- W3C standard for self-sovereign digital identity
- User controls their identity without centralized authorities
- Can be linked to multiple credentials (KYC, membership, reputation)
- Stored in user's wallet, shared selectively

### 10.3 Zero-Knowledge KYC (ZK-KYC)

**What it is:** Proving you meet KYC requirements without revealing your actual identity data.

**How it works technically:**
1. User completes traditional KYC with a licensed provider (e.g., Sumsub, Jumio)
2. Provider issues a ZK credential: "This wallet belongs to a person who passed KYC in jurisdiction X"
3. User stores the credential in their wallet
4. When interacting with the DAO, the user proves their credential is valid via a ZK proof
5. The DAO verifies the proof without learning the user's name, address, or documents

**Key benefit:** Preserves Web3's pseudonymity while meeting regulatory requirements

### 10.4 KYC Tiers for DAO Membership

| Tier | Verification Level | Access Level | Required For |
|------|-------------------|-------------|-------------|
| 0 - Anonymous | Wallet connection only | View-only, public discussions | Observers (Noah Baker type) |
| 1 - Pseudonymous | Email + wallet verification | Voting on non-financial proposals | General members |
| 2 - Verified | ZK-KYC credential | Full voting, token claims, bounty participation | Contributors, members |
| 3 - Identified | Full KYC + accredited investor check | Treasury management, large token grants | Founders, advisors, investors |

**SodaWorld Recommendation:**

Implement tiered KYC aligned with the existing `UserRole` types:

```typescript
interface KYCProfile {
  user_id: string;
  kyc_tier: 0 | 1 | 2 | 3;
  verification_method: 'none' | 'email' | 'zk_kyc' | 'full_kyc';
  provider: string | null;              // 'polygon_id' | 'worldcoin' | 'sumsub'
  credential_hash: string | null;       // ZK credential hash
  verified_at: string | null;
  jurisdiction: string | null;
  accredited_investor: boolean;
  sanctions_checked: boolean;
  sanctions_clear: boolean;
  expires_at: string | null;
}
```

Map to roles:
- `observer` -> Tier 0 (anonymous)
- `member` -> Tier 1 (pseudonymous)
- `contributor` -> Tier 2 (ZK-KYC verified)
- `admin`, `founder` -> Tier 3 (fully identified)

Integrate Polygon ID for ZK-KYC at Tier 2, and a traditional KYC provider (Sumsub or Persona) for Tier 3. Store only credential hashes on-chain via EAS attestations -- never store personal data in the SodaWorld database.

---

## Summary of Recommendations for SodaWorld DAO

### Priority 1: Immediate Enhancements (Current Sprint)

| Enhancement | Description | Codebase Impact |
|-------------|-------------|-----------------|
| EIP-712 Typed Signatures | Replace basic signature verification with EIP-712 structured data signing | Update `signatureService.ts`, add domain separator and typed structs |
| Witness Co-Signature Upgrade | Require 1+ witness for all agreements, verified via EIP-712 | Extend `AgreementSignature` interface, add `witnesses` array |
| Vesting Type Extension | Add hybrid/milestone vesting to `VestingSchedule` | Extend `foundation.d.ts` types, update seed data |
| Dispute Resolution Tiers | Replace flat "Binding arbitration" with tiered resolution | Update `AgreementTerms.dispute_resolution` to structured object |

### Priority 2: Near-Term (Next 2-4 Weeks)

| Enhancement | Description | Codebase Impact |
|-------------|-------------|-----------------|
| EAS Integration | Deploy agreement attestation schema, create on-chain attestations on signature | New `eas-attestation.ts` service, resolver contract |
| Agreement SBTs | Mint soulbound tokens for active agreements | New `AgreementSBT.sol` contract (EIP-5192) |
| Advisor Terms Extension | Add structured advisor-specific terms | New `AdvisorTerms` interface extending `AgreementTerms` |
| Contributor Agreement Enhancements | Add IP model, payment waterfall, off-boarding terms | Update legal module templates |

### Priority 3: Medium-Term (1-3 Months)

| Enhancement | Description | Codebase Impact |
|-------------|-------------|-----------------|
| On-Chain Vesting Contracts | Deploy OpenZeppelin VestingWallet with milestone extensions | New Solidity contracts, oracle integration |
| Kleros Dispute Integration | Implement ERC-792 Arbitrable interface for agreement escrow | New smart contracts, Kleros court configuration |
| KYC Tier System | Implement tiered KYC with ZK verification | New `KYCProfile` table, Polygon ID integration |
| Hats Protocol Roles | Map agreement activation to on-chain role assignment | Hats Protocol integration, role-permission mapping |

### Priority 4: Long-Term (3-6 Months)

| Enhancement | Description | Codebase Impact |
|-------------|-------------|-----------------|
| Legal Entity Stack | Register Wyoming DAO LLC + plan Cayman Foundation | Legal process, update `settings.legal_framework` |
| Full On-Chain Agreement Lifecycle | Agreement creation -> signing -> execution entirely on-chain | Smart contract suite, IPFS storage, subgraph indexing |
| Cross-DAO Agreement Templates | Marketplace for agreement templates | Extend `marketplace_items` with agreement template type |
| AI-Powered Compliance Monitoring | Legal module auto-reviews agreements against changing regulations | Enhance `LegalModule.reviewAgreement()` with regulatory feeds |

---

## Appendix: Key Reference Links

### Standards & Specifications
- [EIP-712: Typed Structured Data Signing](https://eips.ethereum.org/EIPS/eip-712)
- [EIP-191: Signed Data Standard](https://eips.ethereum.org/EIPS/eip-191)
- [EIP-5192: Minimal Soulbound NFTs](https://eips.ethereum.org/EIPS/eip-5192)
- [EIP-1271: Smart Contract Signature Verification](https://www.dynamic.xyz/blog/eip-1271)
- [ERC-792: Arbitration Standard](https://docs.kleros.io/integrations/types-of-integrations/1.-dispute-resolution-integration-plan/smart-contract-integration)

### Platforms & Tools
- [Ethereum Attestation Service (EAS)](https://attest.org/)
- [EAS Documentation](https://docs.attest.org/)
- [EAS SDK (GitHub)](https://github.com/ethereum-attestation-service/eas-sdk)
- [EAS Explorer](https://easscan.org/)
- [Kleros Protocol](https://kleros.io/)
- [Kleros Escrow Documentation](https://docs.kleros.io/products/escrow)
- [Safe (Gnosis Safe)](https://www.bitbond.com/resources/gnosis-safe-multisig-guide-for-projects/)
- [Hats Protocol](https://www.hatsprotocol.xyz/)
- [Hats Protocol Documentation](https://docs.hatsprotocol.xyz/)
- [OpenZeppelin VestingWallet](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/finance/VestingWallet.sol)
- [LexDAO Corpus (GitHub)](https://github.com/lexDAO/LexCorpus)

### Legal Formation
- [Syndicate Web3 Investment Clubs](https://syndicate.mirror.xyz/4p6a0nKpBYMSxoAfN6KpjcUwJSD2t68Dq7zgoliB4pk)
- [Otonomos (OtoCo)](https://otonomist.otonomos.com/announcing-the-d-una-a-new-option-for-daos-in-the-us/)
- [LexDAO](https://lexdao.org/)
- [Rally Legal DAO Contributor Agreement](https://www.rallylegal.com/workflow/dao-contributor-agreement)
- [Wyoming DUNA Statute (SF0050)](https://www.wyoleg.gov/Legislation/2024/SF0050)
- [a16z DUNA Analysis](https://a16zcrypto.com/posts/article/duna-for-daos/)
- [Cayman Foundation for DAOs](https://www.legalnodes.com/article/caymanian-foundation-for-dao)
- [DAO Legal Wrappers Comparison (DAObox)](https://daobox.io/blog/top-dao-legal-wrappers-jurisdictions-global-guide)
- [a16z DAO Legal Framework](https://api.a16zcrypto.com/wp-content/uploads/2022/06/dao-legal-framework-part-1.pdf)

### Identity & KYC
- [Polygon ID](https://polygon.technology/blog/introducing-polygon-id-zero-knowledge-own-your-identity-for-web3)
- [World ID (Worldcoin)](https://world.org/blog/world/proof-of-personhood-what-it-is-why-its-needed)
- [KYC for DAOs Guide](https://didit.me/blog/kyc-for-daos/)
- [Crypto Compliance Guide 2025](https://kyc-chain.com/crypto-compliance-your-guide-to-do-kyc-aml-in-2025/)

### Token Vesting
- [Token Vesting Complete Guide (Tokenomics.com)](https://tokenomics.com/articles/token-vesting-complete-guide-to-vesting-schedules-cliffs-and-unlock-mechanisms)
- [Token Allocation & Compensation (Toku)](https://www.toku.com/resources/token-allocation-and-compensation-plan)
- [Vesting Benchmarks (Liquifi)](https://www.liquifi.finance/post/token-vesting-and-allocation-benchmarks)

### Dispute Resolution
- [Kleros Whitepaper](https://kleros.io/whitepaper.pdf)
- [Kleros Smart Contract Integration Guide](https://docs.kleros.io/integrations/types-of-integrations/1.-dispute-resolution-integration-plan/smart-contract-integration)
- [Decentralized Arbitration Academic Analysis (Frontiers)](https://www.frontiersin.org/articles/10.3389/fbloc.2021.564551/full)
- [Oxford Law: Legal Wrappers Reshaping DAO Governance](https://blogs.law.ox.ac.uk/oblb/blog-post/2025/05/code-contract-how-legal-wrappers-are-reshaping-dao-governance)

### Signature Standards Analysis
- [Cyfrin: Understanding EIP-191 & EIP-712](https://www.cyfrin.io/blog/understanding-ethereum-signature-standards-eip-191-eip-712)
- [Spruce ID: EIP-191 vs EIP-712](https://blog.spruceid.com/sign-in-with-ethereum-wallet-support-eip-191-vs-eip-712/)
- [W3C Ethereum EIP712 Signature 2021 Spec](https://w3c-ccg.github.io/ethereum-eip712-signature-2021-spec/)
