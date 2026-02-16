# SodaWorld DAO — Agreements & Signatures Research

**Date:** February 15, 2026 | **Sources:** 30+ references

---

## Executive Summary

Research across Syndicate, Otonomos, LexDAO, Kleros, Ethereum Attestation Service (EAS), Hats Protocol, and Web3 legal frameworks reveals SodaWorld's agreement system is unique in the DAO space but needs upgrades: EIP-712 typed signatures, EAS attestations, Soulbound Token representation, tiered dispute resolution, ZK-KYC compliance, and proper legal wrapper selection.

---

## 1. DAO Legal Agreement Platforms

### Syndicate
- Embeds legal templates directly into product
- Partners with Latham & Watkins for compliance
- Investment Club product generates LLC operating agreements automatically

### Otonomos
- Pioneered on-chain company formation
- Operating agreements embedded in code, not signed PDFs
- Multi-jurisdiction: Cayman, Wyoming, BVI, Singapore

### LexDAO
- Maintains LexCorpus: open-source building-block contracts
- LexLocker: escrow with integrated arbitration
- LexART: asset tokenization contracts

**Recommendation:** Connect Legal AI module to auto-generate compliant agreements from clause libraries. Model LexLocker escrow pattern for milestone-based token releases.

---

## 2. Smart Contract-Based Agreements

### Soulbound Tokens (EIP-5192)
- Non-transferable ERC-721 tokens — perfect for agreements (shouldn't be tradeable)
- `locked()` function returns true, preventing transfers
- `Locked(tokenId)` event emitted on mint
- **Recommendation:** Mint `SodaWorldAgreementSBT` when agreements reach `active` status

### Hats Protocol (Role-Based)
- Non-transferable ERC-1155 tokens organized in tree structures
- Each "hat" = a role with specific permissions
- Revocable by DAO governance
- 50+ DAOs using it
- **Recommendation:** Layer Hats Protocol roles (Founder Hat, Advisor Hat, Contributor Hat) on top of existing `UserRole` types

---

## 3. Ethereum Attestation Service (EAS)

### How It Works
- Two contracts: `SchemaRegistry.sol` and `EAS.sol`
- Register a schema (define what you're attesting to)
- Create attestations (on-chain or off-chain)
- Resolver contracts can trigger actions (mint NFTs, execute governance)
- Free to use (just gas costs)

### SodaWorld Schema
```solidity
bytes32 agreementId,
address signer,
string signerType,      // 'founder' | 'advisor' | 'contributor'
bytes32 contentHash,     // SHA-256 of agreement content
address[] witnesses
```

**Recommendation:** Create attestations when agreements are signed, replacing basic signature storage with verifiable, composable on-chain records.

---

## 4. Digital Signature Standards

### Current State
SodaWorld uses basic Solana signature verification in `_extracted_signatures.ts`.

### Industry Standard: EIP-712
- Typed structured data signing with human-readable prompts
- Domain separator prevents replay attacks across chains/contracts
- **Recommended implementation:**

```typescript
const domain = {
  name: 'SodaWorld DAO',
  version: '1',
  chainId: 1,
  verifyingContract: '0x...'
};

const types = {
  AgreementSignature: [
    { name: 'agreementId', type: 'string' },
    { name: 'contentHash', type: 'bytes32' },
    { name: 'signerRole', type: 'string' },
    { name: 'timestamp', type: 'uint256' },
    { name: 'nonce', type: 'uint256' }
  ]
};
```

### EIP-1271 (Smart Contract Wallets)
- Extends signatures to multi-sig wallets like Safe
- `isValidSignature(hash, signature)` returns magic value
- **Needed for:** Council multi-sig co-signing of agreements

### Recommendation
- Implement EIP-712 with SodaWorld domain separator
- Define typed structures for `AgreementSignature` and `WitnessCoSignature`
- Add nonce tracking for replay protection
- Support EIP-1271 for Safe wallet signatures

---

## 5. Vesting Agreement Patterns

### Industry Best Practice: Hybrid Vesting
- 70% time-based linear vesting (cliff + linear)
- 30% milestone-based bonuses
- OpenZeppelin `VestingWallet.sol` as base contract

### Recommended Extension
```typescript
export interface VestingSchedule {
  // ...existing fields...
  vesting_type: 'linear' | 'milestone' | 'hybrid';
  milestones?: VestingMilestone[];
}

interface VestingMilestone {
  title: string;
  criteria: string;
  token_amount: number;
  percentage: number;
  verified_by?: string;  // EAS attestation UID
}
```

---

## 6. Contributor Agreements

### Standard Terms (2025 industry)
- Scope of work with deliverable specifications
- Compensation: hybrid token + stablecoin preferred
- IP assignment: full assignment to DAO (most common)
- 30-day termination notice
- Vesting with cliff

### Current Gaps in SodaWorld
- Missing deliverable specifications
- No payment waterfall definitions (what if treasury runs low?)
- No open-source clauses
- No off-boarding procedures
- No performance review triggers

### Recommended Additions
Add to `AgreementTerms` interface:
```typescript
deliverables?: { title: string; deadline: string; acceptance_criteria: string }[];
payment_waterfall?: { priority: number; source: string; percentage: number }[];
performance_reviews?: { frequency: 'monthly' | 'quarterly'; criteria: string[] };
offboarding?: { notice_days: number; handoff_requirements: string[] };
```

---

## 7. Advisor Agreement Best Practices

### Industry Standards
- Allocation: 0.25%-1.0% of total supply per advisor
- Total advisor pool: 5-10% of supply
- Vesting: 6-month cliff, 24-month linear
- Lock-up: often separate from cliff (vested but locked)

### SodaWorld Current
- Lisa Park: 2.0% (2M SODA) — high end
- David Kumar: 1.5% (1.5M) — high end
- Combined: 3.5% — within typical pool range

### Missing Terms
- Clawback provisions (bad-leaver terms)
- Lock-up periods separate from cliff
- Non-compete / non-solicitation clauses
- Specific deliverable requirements
- Good-leaver / bad-leaver definitions

---

## 8. DAO Legal Wrappers

### 2025-2026 Options

| Wrapper | Best For | Cost | Key Feature |
|---------|----------|------|-------------|
| **Wyoming DUNA** | US DAOs, 100+ members | ~$500 filing | First US legal recognition of DAOs |
| **Wyoming DAO LLC** | Small DAOs, <100 members | ~$100 filing | Limited liability, simple |
| **Cayman Foundation** | Token issuance | ~$15K setup | No shareholders, no corporate tax |
| **Marshall Islands DAO LLC** | DeFi protocols | ~$5K | International recognition |
| **Swiss Foundation** | European DAOs | ~$30K | Highly regulated, prestigious |

### Entity Stack Pattern
- **US DevCo** (Delaware LLC or C-Corp): employs team, holds IP
- **Offshore TokenCo** (Cayman Foundation): issues tokens, manages treasury
- **DAO wrapper** (Wyoming DUNA or LLC): governance layer

### Recommendation for SodaWorld
1. **Now:** Wyoming DAO LLC for immediate liability protection ($100)
2. **Pre-token launch:** Cayman Foundation Company for SODA issuance
3. **At scale (100+ members):** Consider DUNA conversion

---

## 9. Dispute Resolution

### Kleros (Decentralized Arbitration)
- Leading protocol, thousands of disputes since 2018
- Stake-weighted random juror selection
- Commit-reveal voting scheme
- ERC-792 Arbitrable standard for smart contract integration
- Enterprise adoption in 2026 (fintech, insurance, governments)

### Recommended Three-Tier System
Replace flat "Binding arbitration" clause with:

| Tier | Dispute Value | Resolution Method | Timeline |
|------|-------------|-------------------|----------|
| 1 | Under $10K | Internal governance vote | 7 days |
| 2 | $10K - $100K | Kleros decentralized court | 14-30 days |
| 3 | Over $100K | Traditional JAMS arbitration | 60-90 days |

### Implementation
```typescript
interface DisputeResolution {
  tier: 1 | 2 | 3;
  method: 'internal_vote' | 'kleros' | 'jams_arbitration';
  max_value: number;
  timeline_days: number;
  governing_law: string;  // 'Wyoming' | 'Cayman' | 'Switzerland'
}
```

---

## 10. KYC/AML Compliance

### Regulatory Landscape (2025-2026)
- Regulators globally pressing for DAO compliance
- EU MiCA framework effective
- US SEC and CFTC increasing enforcement
- Zero-knowledge KYC emerging as privacy-preserving solution

### Zero-Knowledge KYC
- **Polygon ID / World ID**: Verify identity without revealing personal data
- Prove "I am a real human over 18" without sharing name/DOB
- Credential stored as ZK proof, verifiable on-chain

### Recommended Four-Tier KYC

| Tier | Verification | Role Access | Data Stored |
|------|-------------|-------------|-------------|
| 0 | Anonymous | Observer | None |
| 1 | Email verified | Member | Email hash only |
| 2 | ZK-KYC (Polygon ID) | Contributor | ZK credential hash |
| 3 | Full KYC (passport + address) | Founder, Advisor | Encrypted reference to KYC provider |

**Critical:** Never store personal data in SodaWorld database. Store only credential hashes via EAS attestations.

---

## Implementation Priority

### Immediate (This Sprint)
- Add `contentHash` (SHA-256) to all agreements for tamper detection
- Add nonce tracking to prevent signature replay
- Extend `AgreementTerms` with deliverables, performance reviews, offboarding

### 2-4 Weeks
- Implement EIP-712 typed signing for all agreement signatures
- Add dispute resolution tiers to agreement templates
- Add clawback/good-leaver/bad-leaver terms to advisor agreements

### 1-3 Months
- Deploy EAS attestation schema on testnet
- Implement Soulbound Token minting for active agreements
- Add ZK-KYC (Tier 2) for contributors via Polygon ID
- Integrate Kleros for Tier 2 dispute resolution

### 3-6 Months
- Wyoming DAO LLC filing
- Cayman Foundation setup (pre-token launch)
- Full EIP-1271 support for Safe multi-sig signing
- Hats Protocol integration for role-based permissions

---

*30+ sources: Syndicate, Otonomos, LexDAO, EAS, EIP-712, EIP-5192, Kleros, Hats Protocol, Rally Legal, Wyoming DUNA, Cayman Foundation, Polygon ID, and academic/legal analysis*
