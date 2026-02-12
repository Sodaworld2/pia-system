# SodaWorld DAO Platform - API Contracts Specification

**Version:** 1.0.0
**Last Updated:** 2026-02-12
**Machine:** #1 Hub
**Repository:** DAOV1
**Stack:** React + Express + SQLite (Knex) + Solana + Firebase Auth + Gemini AI

---

## Table of Contents

1. [Standard Response Format](#1-standard-response-format)
2. [Authentication & Authorization](#2-authentication--authorization)
3. [Error Code Reference](#3-error-code-reference)
4. [Existing Routes](#4-existing-routes)
   - 4.1 [Health (`/api/health`)](#41-health)
   - 4.2 [DAO (`/api/dao`)](#42-dao)
   - 4.3 [Council (`/api/council`)](#43-council)
   - 4.4 [Agreements (`/api/agreements`)](#44-agreements)
   - 4.5 [Founder Agreements (`/api/agreements/founder`)](#45-founder-agreements)
   - 4.6 [Advisor Agreements (`/api/agreements/advisor`)](#46-advisor-agreements)
   - 4.7 [Contributor Agreements (`/api/agreements/contributor`)](#47-contributor-agreements)
   - 4.8 [First Born Agreements (`/api/agreements/firstborn`)](#48-first-born-agreements)
   - 4.9 [Contracts (`/api/contracts`)](#49-contracts)
   - 4.10 [Signatures (`/api/signatures`)](#410-signatures)
   - 4.11 [Milestones (`/api/milestones`)](#411-milestones)
   - 4.12 [Proposals (`/api/proposals`)](#412-proposals)
   - 4.13 [Treasury (`/api/treasury`)](#413-treasury)
   - 4.14 [Tokens (`/api/tokens`)](#414-tokens)
   - 4.15 [Token Distribution (`/api/token-distribution`)](#415-token-distribution)
   - 4.16 [Marketplace (`/api/marketplace`)](#416-marketplace)
   - 4.17 [Gemini / Mentor (`/api/gemini`, `/api/mentor`)](#417-gemini--mentor)
   - 4.18 [Brain (`/api/brain`)](#418-brain)
5. [New Routes](#5-new-routes)
   - 5.1 [Users (`/api/users`)](#51-users)
   - 5.2 [Knowledge (`/api/knowledge`)](#52-knowledge)
   - 5.3 [Modules (`/api/modules`)](#53-modules)
   - 5.4 [Events (`/api/events`)](#54-events)
   - 5.5 [Unified Agreements (`/api/agreements/unified`)](#55-unified-agreements)
6. [Foundation Types Reference](#6-foundation-types-reference)
7. [Rate Limiting](#7-rate-limiting)
8. [WebSocket Events](#8-websocket-events)

---

## 1. Standard Response Format

All API responses MUST conform to this envelope:

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;          // Machine-readable error code (e.g., "NOT_FOUND")
    message: string;       // Human-readable error message
    details?: any;         // Optional additional context
  };
  meta?: {
    page?: number;         // Current page (1-indexed)
    limit?: number;        // Items per page
    total?: number;        // Total items available
    timestamp: string;     // ISO 8601 timestamp
  };
}
```

**Success example:**
```json
{
  "success": true,
  "data": { "id": 1, "name": "SodaWorld DAO" },
  "meta": { "timestamp": "2026-02-12T10:30:00.000Z" }
}
```

**Error example:**
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Council member not found"
  },
  "meta": { "timestamp": "2026-02-12T10:30:00.000Z" }
}
```

**Paginated example:**
```json
{
  "success": true,
  "data": [ ... ],
  "meta": {
    "page": 1,
    "limit": 50,
    "total": 237,
    "timestamp": "2026-02-12T10:30:00.000Z"
  }
}
```

---

## 2. Authentication & Authorization

### Auth Mechanism
- **Firebase Auth** for user authentication (JWT Bearer tokens)
- **Admin Password** for admin/health detailed endpoints (Bearer token via `ADMIN_PASSWORD` env var)
- **Solana Wallet Signatures** for on-chain identity verification

### Roles

| Role | Description | Access Level |
|------|-------------|-------------|
| `public` | No authentication required | Read-only on public endpoints |
| `member` | Firebase-authenticated user | Read + write on own resources |
| `council` | Council member (founder/advisor/contributor/firstborn) | Agreement management |
| `founder` | DAO Founder (max 7 per DAO) | Full DAO management, treasury signing |
| `admin` | System administrator | Full access including DB admin |

### Auth Headers
```
Authorization: Bearer <firebase_id_token>    // For user endpoints
Authorization: Bearer <admin_password>       // For admin endpoints
X-Wallet-Address: <solana_public_key>        // For wallet-authenticated endpoints
```

---

## 3. Error Code Reference

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected server error |
| `NOT_FOUND` | 404 | Resource not found |
| `MISSING_FIELDS` | 400 | Required fields missing from request |
| `MISSING_PERSONAL_DETAILS` | 400 | Required personal details missing |
| `MISSING_ROLE_CATEGORY` | 400 | Role category field missing |
| `MISSING_TOKEN_DETAILS` | 400 | Token allocation details missing |
| `MISSING_TOKEN_STRUCTURE` | 400 | Token structure fields missing |
| `INVALID_WALLET_ADDRESS` | 400 | Wallet address format invalid (< 32 chars) |
| `INVALID_STATUS` | 400 | Status value not in allowed set |
| `INVALID_ROLE_TYPE` | 400 | Role type not in [founder, advisor, contributor, firstborn] |
| `INVALID_ADVISOR_TYPE` | 400 | Advisor type not valid |
| `INVALID_CONTRIBUTION_TYPE` | 400 | Contribution type not in [time, materials, services] |
| `INVALID_CONTRIBUTION_AMOUNT` | 400 | Capital contribution amount <= 0 |
| `INVALID_CURRENCY` | 400 | Currency not in [USD, USDC, USDT, ETH, BTC, SOL] |
| `INVALID_TOKEN_AMOUNT` | 400 | Token reward amount <= 0 |
| `INVALID_VESTING_PERIOD` | 400 | Vesting months < 1 |
| `INVALID_CULTURAL_BENEFITS` | 400 | Cultural benefits contain invalid values |
| `INVALID_ENGAGEMENT_TYPE` | 400 | Engagement type not valid |
| `INVALID_IMMEDIATE_GRANT` | 400 | Immediate grant exceeds total value |
| `INVALID_PERCENTAGE` | 400 | Percentage value out of 0-100 range |
| `INVALID_MILESTONE_IDS` | 400 | Milestone IDs don't belong to member |
| `EMAIL_DUPLICATE` | 409 | Email already exists for this DAO |
| `CONFLICT` | 409 | Resource conflict (e.g., duplicate link) |
| `MAX_FOUNDERS_EXCEEDED` | 403 | Already 7 founders in DAO |
| `MAX_MILESTONES_EXCEEDED` | 400 | More than 12 milestones |
| `INSUFFICIENT_TOKENS` | 400 | Token allocation exceeds pool |
| `BONUS_EXCEEDS_POOL` | 400 | Bonus milestone total exceeds bonus pool |
| `DAO_NOT_FOUND` | 404 | Referenced DAO does not exist |
| `AGREEMENT_NOT_FOUND` | 404 | Agreement not found |
| `MEMBER_NOT_FOUND` | 404 | Council member not found |
| `CONTRACT_NOT_FOUND` | 404 | Generated contract not found |
| `DATA_NOT_FOUND` | 404 | Referenced data not found |
| `RELEASE_NOT_FOUND` | 404 | Vesting release entry not found |
| `WRONG_AGREEMENT_TYPE` | 400 | Endpoint called with wrong agreement type |
| `CONTRACT_REQUIRED` | 400 | Generated contract required before action |
| `CONTRACT_GENERATION_FAILED` | 500 | AI contract generation failed |
| `CONTRACT_REGENERATION_FAILED` | 500 | AI contract regeneration failed |
| `ALREADY_APPROVED` | 400 | Contract already approved |
| `ALREADY_COMPLETED` | 400 | Milestone already completed |
| `ALREADY_RELEASED` | 400 | Tokens already released |
| `MILESTONE_COMPLETED` | 400 | Cannot modify completed milestone |
| `DELIVERABLE_VERIFIED` | 400 | Cannot modify verified deliverable |
| `VALIDATION_ERROR` | 400 | General validation failure |

---

## 4. Existing Routes

---

### 4.1 Health

**Base Path:** `/api/health`

#### `GET /api/health`
Basic health check.

- **Auth:** None (public)
- **Response (200):**
```typescript
{
  status: "healthy" | "unhealthy";
  timestamp: string;                // ISO 8601
  uptime: number;                   // seconds
  environment: string;              // "development" | "production"
  node_version: string;
  memory: {
    used: number;                   // MB
    total: number;                  // MB
    percentage: number;
  };
  database: {
    status: "connected" | "disconnected" | "unknown";
    latency: number;                // ms
  };
}
```
- **Error (503):** If database is disconnected, returns same shape with `status: "unhealthy"`

#### `GET /api/health/detailed`
Comprehensive system diagnostics.

- **Auth:** Admin (Bearer `ADMIN_PASSWORD`)
- **Response (200):**
```typescript
{
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptime: {
    seconds: number;
    formatted: string;              // e.g., "2d 5h 30m"
  };
  environment: string;
  node_version: string;
  platform: string;
  architecture: string;
  system: {
    hostname: string;
    cpus: number;
    totalMemory: number;            // GB
    freeMemory: number;             // GB
    loadAverage: number[];
  };
  memory: {
    heapUsed: number;               // MB
    heapTotal: number;              // MB
    rss: number;                    // MB
    external: number;               // MB
    percentage: number;
  };
  database: {
    status: string;
    latency: number;
    tables: Array<{ name: string; rows: number }>;
  };
  api: {
    totalRequests: number;
    totalErrors: number;
    errorRate: number;              // percentage
    averageResponseTime: number;    // ms
    requestsByEndpoint: Record<string, number>;
    errorsByEndpoint: Record<string, number>;
    slowestRequests: any[];
  };
  recentErrors: Array<{ message: string; timestamp: string }>;
}
```
- **Error (401):** `{ error: "Unauthorized" }`

#### `GET /api/health/live`
Liveness probe for container orchestration.

- **Auth:** None
- **Response (200):** `{ status: "alive" }`

#### `GET /api/health/ready`
Readiness probe for container orchestration.

- **Auth:** None
- **Response (200):** `{ status: "ready" }`
- **Error (503):** `{ status: "not ready", error: "Database unavailable" }`

---

### 4.2 DAO

**Base Path:** `/api/dao`

#### `GET /api/dao`
Get the primary DAO configuration.

- **Auth:** None (public)
- **Response (200):**
```typescript
{
  personalDetails: {
    name: string;
    surname: string;
    cellphone: string;
  };
  daoDetails: {
    name: string;
    logo: string | null;
    economyType: string;
  };
  walletAddress: string;
  tokenomics: {
    founders: number;               // percentage
    advisors: number;
    foundation: number;
    firstBorns: number;
  };
  legal: {
    country: string;
    generatedContract: string | null;
  };
}
```
- **Response:** `null` if no DAO exists

#### `POST /api/dao`
Create a new DAO.

- **Auth:** `member` (Firebase)
- **Request Body:**
```typescript
{
  personalDetails?: {
    name: string;                   // required
    surname: string;                // required
    cellphone?: string;
  };
  daoDetails: {
    name: string;                   // 2-100 characters, required
    description: string;
    logo: string | null;            // base64 or URL
  };
  totalSupply: number;              // > 0, required
  growthDistribution: {
    founders: number;
    operational: number;
    scaleCommunity: number;
  };
  tokenomics: {
    founders: number;
    advisors: number;
    foundation: number;
    firstBorns: number;
  };
  legal: {
    country: string;                // required
    generatedContract?: string;
  };
}
```
- **Response (201):** Same shape as `GET /api/dao`
- **Errors:**
  - 400: Validation failed (missing/invalid `daoDetails.name`, `totalSupply`, `legal.country`)
  - 500: `{ error: "Failed to create DAO", details: string }`

#### `GET /api/dao/:id`
Get a specific DAO by ID.

- **Auth:** None
- **Params:** `id` (number) - DAO ID
- **Response (200):** Raw DAO database row
- **Error (404):** `{ error: "DAO not found" }`

#### `GET /api/dao/dashboard/vitals`
Get ecosystem dashboard vitals.

- **Auth:** None
- **Response (200):**
```typescript
{
  userCount: number;
  activeBubbles: number;
  activeProposals: number;
}
```

---

### 4.3 Council

**Base Path:** `/api/council`

#### `GET /api/council`
Get all council members grouped by role.

- **Auth:** None
- **Query Params:**
  - `dao_id` (number, optional) - Filter by DAO
  - `status` (string, optional) - Filter by status
  - `role_type` (string, optional) - Filter by role type
- **Response (200):**
```typescript
{
  success: true;
  data: {
    founders: CouncilMember[];
    advisors: CouncilMember[];
    contributors: CouncilMember[];
    firstborn: CouncilMember[];
  };
  stats: {
    founders: { count: number; max: 7; tokens: number };
    advisors: { count: number; tokens: number };
    contributors: { count: number; tokens: number };
    firstborn: { count: number; tokens: number };
  };
}
```
Where `CouncilMember`:
```typescript
{
  id: number;
  dao_id: number;
  agreement_id: number | null;
  name: string;
  surname: string;
  email: string;
  phone: string | null;
  wallet_address: string;
  photo_url: string | null;
  role_type: "founder" | "advisor" | "contributor" | "firstborn";
  role_category: string | null;
  custom_role_description: string | null;
  token_allocation_total: number;
  firestarter_period_months: number | null;
  term_months: number | null;
  status: "draft" | "pending_signature" | "active" | "completed" | "cancelled";
  created_at: string;
  updated_at: string;
  activated_at: string | null;
  completed_at: string | null;
  agreement_title?: string;
  agreement_status?: string;
  milestones_completed: number;
  milestones_total: number;
}
```

#### `GET /api/council/stats`
Get summary statistics only.

- **Auth:** None
- **Query Params:** `dao_id` (number, optional)
- **Response (200):**
```typescript
{
  success: true;
  stats: {
    founders: { count: number; max: 7; tokens: number };
    advisors: { count: number; tokens: number };
    contributors: { count: number; tokens: number };
    firstborn: { count: number; tokens: number };
  };
}
```

#### `GET /api/council/by-wallet/:walletAddress`
Get council member by Solana wallet address.

- **Auth:** None
- **Params:** `walletAddress` (string) - Solana public key
- **Response (200):**
```typescript
{
  success: true;
  data: {
    ...CouncilMember;
    milestones_completed: number;
    milestones_total: number;
  };
}
```
- **Error (404):** `{ success: false, error: "No council member found for this wallet address", code: "NOT_FOUND" }`

#### `GET /api/council/:id`
Get single member with full details.

- **Auth:** None
- **Params:** `id` (number)
- **Response (200):**
```typescript
{
  success: true;
  data: {
    ...CouncilMember;
    agreement_details: object | null;    // Parsed JSON
    milestones: Milestone[];
    contracts: GeneratedContract[];
    signatures: Array<{
      id: string;
      address: string;
      signedAt: string;
      verified: boolean;
    }>;
    workflow_history: Array<{
      from_status: string | null;
      to_status: string;
      reason: string;
      changed_by: string;
      created_at: string;
    }>;
  };
}
```

#### `GET /api/council/role/:roleType`
Get members filtered by role type.

- **Auth:** None
- **Params:** `roleType` - one of `founder`, `advisor`, `contributor`, `firstborn`
- **Query Params:** `dao_id` (optional), `status` (optional)
- **Response (200):**
```typescript
{
  success: true;
  data: CouncilMember[];
  stats: { count: number; max?: number; tokens: number };
}
```
- **Error (400):** `{ success: false, error: "Invalid role type...", code: "INVALID_ROLE_TYPE" }`

#### `GET /api/council/by-sodaworld/:sodaworldUserId`
Get council member by SodaWorld user ID.

- **Auth:** None
- **Params:** `sodaworldUserId` (string)
- **Response (200):**
```typescript
{
  success: true;
  data: {
    ...CouncilMember;
    milestones_completed: number;
    milestones_total: number;
    vesting: {
      totalTokens: number;
      claimedTokens: number;
      startDate: string;
      cliffDate: string;
      endDate: string;
    } | null;
  };
}
```

#### `POST /api/council/:id/link-sodaworld`
Link a council member to a SodaWorld user account.

- **Auth:** `admin`
- **Params:** `id` (number) - Council member ID
- **Request Body:**
```typescript
{
  sodaworldUserId: string;           // required
}
```
- **Response (200):**
```typescript
{
  success: true;
  message: "Council member linked to SodaWorld account";
  data: {
    councilMemberId: string;
    sodaworldUserId: string;
  };
}
```
- **Errors:**
  - 400: `VALIDATION_ERROR` - Missing `sodaworldUserId`
  - 404: `NOT_FOUND` - Council member not found
  - 409: `CONFLICT` - SodaWorld user already linked

#### `GET /api/council/unlinked`
Get all council members not yet linked to SodaWorld.

- **Auth:** `admin`
- **Response (200):**
```typescript
{
  success: true;
  data: Array<{
    id: number;
    name: string;
    surname: string;
    email: string;
    role_type: string;
    status: string;
    token_allocation_total: number;
  }>;
  count: number;
}
```

---

### 4.4 Agreements

**Base Path:** `/api/agreements`

#### `GET /api/agreements`
Get all agreements.

- **Auth:** None
- **Response (200):** Array of agreements with parsed `party` and `details` JSON fields
```typescript
Array<{
  id: string;
  title: string;
  type: string;
  party: { name: string; surname: string; email: string; walletAddress: string };
  termOfEngagement: number;
  startDate: string;
  status: string;
  details: object;
  created_at: string;
}>
```

#### `POST /api/agreements`
Create a new agreement (generic).

- **Auth:** `member`
- **Request Body:**
```typescript
{
  title: string;                     // required
  type: string;                      // required (e.g., "adviser", "contributor")
  party: {                           // required
    name: string;
    surname?: string;
    email?: string;
    walletAddress?: string;
  };
  termOfEngagement?: number;         // years, default 0
  startDate?: string;                // ISO date, default now
  status?: string;                   // default "Draft"
  details?: object;                  // agreement-specific details
}
```
- **Response (201):**
```typescript
{
  success: true;
  data: {
    id: string;                      // "agmt_<uuid>"
    title: string;
    type: string;
    party: object;
    details: object;
    ...
  };
}
```

#### `GET /api/agreements/by-wallet/:walletAddress`
Get all agreements for a wallet address (including multi-sig).

- **Auth:** None
- **Params:** `walletAddress` (string)
- **Response (200):**
```typescript
{
  success: true;
  data: Array<{
    ...Agreement;
    signatures: Array<{
      address: string;
      signedAt: string;
      verified: boolean;
    }>;
    userHasSigned: boolean;
  }>;
  count: number;
}
```

#### `GET /api/agreements/threads/:threadId`
Get a negotiation thread.

- **Auth:** None
- **Params:** `threadId` (string)
- **Response (200):**
```typescript
{
  id: string;
  agreementId: string;
  sectionKey: string;
  action: string;
  proposedChange: object;
  reasonCode: object;
  message: string;
  createdBy: string;
  status: string;
  events: Array<{
    ts: string;
    type: string;
    actor: string;
    payload: object;
  }>;
}
```
- **Error (404):** `{ error: "Negotiation thread not found" }`

#### `GET /api/agreements/:id`
Get a specific agreement by ID.

- **Auth:** None
- **Params:** `id` (string)
- **Response (200):** Agreement with parsed `party` and `details`
- **Error (404):** `{ error: "Agreement not found" }`

#### `POST /api/agreements/:agreementId/sections/:sectionKey/decide`
Make a decision on an agreement section (accept/reject/amend).

- **Auth:** `member`
- **Params:** `agreementId` (string), `sectionKey` (string)
- **Request Body:**
```typescript
{
  decision: "accept" | "reject" | "amend";
  reasonCode?: object;               // required for amend
  message?: string;                  // required for amend
  proposedChange?: object;           // required for amend
}
```
- **Response (200):** Updated agreement

#### `POST /api/agreements/:id/sign`
Sign an agreement with a wallet.

- **Auth:** `member`
- **Params:** `id` (string)
- **Request Body:**
```typescript
{
  signerAddress: string;             // Ethereum/Solana address, required
  signature: string;                 // min 10 chars, required
  timestamp?: string;                // ISO date
}
```
- **Response (200):**
```typescript
{
  success: true;
  agreement: {
    ...Agreement;
    status: string;                  // may be updated to "Signed" or "Fully Executed"
  };
  signatures: Array<{
    address: string;
    signedAt: string;
    verified: boolean;
  }>;
}
```
- **Errors:**
  - 400: `{ error: "Agreement already signed by this address" }`
  - 403: `{ error: "Not an authorized party to this agreement" }`
  - 404: `{ error: "Agreement not found" }`

#### `GET /api/agreements/:id/signatures`
Get all signatures for an agreement.

- **Auth:** None
- **Params:** `id` (string)
- **Response (200):**
```typescript
{
  agreementId: string;
  title: string;
  status: string;
  requiredSigners: string[];
  signatures: Array<{
    address: string;
    signed: boolean;
    signedAt: string | null;
    verified: boolean;
  }>;
  allSignatures: Array<{
    id: string;
    address: string;
    signature: string;
    verified: boolean;
    signedAt: string;
  }>;
}
```

#### `PUT /api/agreements/:agreementId/milestones/:milestoneId/verify`
Verify a milestone within an agreement.

- **Auth:** `admin` / `founder`
- **Params:** `agreementId` (string), `milestoneId` (string)
- **Request Body:**
```typescript
{
  verified?: boolean;                // default true
  verifier?: string;                 // default "system"
  notes?: string;
}
```
- **Response (200):**
```typescript
{
  success: true;
  message: "Milestone verified successfully";
  milestone: {
    id: string;
    verified: boolean;
    verifiedBy: string;
    verifiedAt: string;
    verificationNotes: string | null;
  };
}
```

---

### 4.5 Founder Agreements

**Base Path:** `/api/agreements/founder`

#### `GET /api/agreements/founder`
List all founder agreements.

- **Auth:** None
- **Query Params:** `dao_id` (number, optional)
- **Response (200):**
```typescript
{
  success: true;
  data: Array<CouncilMember & {
    agreement_id: number;
    agreement_title: string;
    agreement_status: string;
    agreement_created_at: string;
  }>;
  count: number;
}
```

#### `GET /api/agreements/founder/:id`
Get a specific founder agreement with milestones and contracts.

- **Auth:** None
- **Params:** `id` (number) - Council member ID
- **Response (200):**
```typescript
{
  success: true;
  data: {
    ...CouncilMember;
    agreement_details: {
      role_category: string;
      custom_role_description: string | null;
      token_allocation: number;
      firestarter_period_months: number;
      rules_terms: string;
      legal_framework: string;
      milestone_count: number;
    } | null;
    milestones: Milestone[];
    contracts: GeneratedContract[];
  };
}
```
- **Error (404):** `NOT_FOUND`

#### `POST /api/agreements/founder`
Create a new founder agreement.

- **Auth:** `admin` / `founder`
- **Request Body:**
```typescript
{
  dao_id: number;                    // required
  member_id?: number;                // optional, link to existing member
  personal_details: {                // required
    name: string;                    // required
    surname: string;                 // required
    email: string;                   // required, unique per DAO
    wallet_address: string;          // required, min 32 chars (Solana)
    phone?: string;
    photo_url?: string;
  };
  role_details: {                    // required
    role_category: string;           // required
    custom_role_description?: string;
  };
  token_details: {                   // required
    token_allocation: number;        // required, must fit in Founders pool (40%)
    firestarter_period_months: number; // required
  };
  milestones?: Array<{              // optional, max 12
    title: string;
    description?: string;
    milestone_order?: number;
    target_date?: string;
    token_amount?: number;
  }>;
  rules_terms?: string;
  legal_framework: string;           // required
}
```
- **Response (201):**
```typescript
{
  success: true;
  data: {
    agreement_id: number;
    member_id: number;
    contract_generation_status: "queued";
    next_step: "contract_generation";
  };
}
```
- **Errors:**
  - 400: `MISSING_FIELDS`, `MISSING_PERSONAL_DETAILS`, `MISSING_ROLE_CATEGORY`, `MISSING_TOKEN_DETAILS`, `INVALID_WALLET_ADDRESS`, `INSUFFICIENT_TOKENS`, `MAX_MILESTONES_EXCEEDED`
  - 403: `MAX_FOUNDERS_EXCEEDED` (already 7 founders)
  - 404: `DAO_NOT_FOUND`
  - 409: `EMAIL_DUPLICATE`

#### `POST /api/agreements/founder/:agreementId/generate-contract`
Generate an AI contract using Gemini.

- **Auth:** `admin` / `founder`
- **Params:** `agreementId` (number)
- **Request Body:**
```typescript
{
  custom_terms?: string;
}
```
- **Response (201):**
```typescript
{
  success: true;
  data: {
    contract_id: number;
    status: "generated";
    contract_version: number;
    estimated_time_seconds: 0;
  };
}
```
- **Errors:**
  - 404: `AGREEMENT_NOT_FOUND`, `MEMBER_NOT_FOUND`
  - 500: `CONTRACT_GENERATION_FAILED`

#### `PUT /api/agreements/founder/:id/status`
Update founder agreement workflow status.

- **Auth:** `admin`
- **Params:** `id` (number) - Council member ID
- **Request Body:**
```typescript
{
  status: "draft" | "pending" | "signed" | "active" | "cancelled";  // required
  reason?: string;
  changed_by: string;                // required
}
```
- **Response (200):**
```typescript
{
  success: true;
  data: {
    member_id: string;
    agreement_id: number;
    from_status: string;
    to_status: string;
    updated_at: string;
  };
}
```

#### `POST /api/agreements/founder/:id/submit`
Submit agreement for signatures (Draft -> Pending).

- **Auth:** `admin`
- **Params:** `id` (number)
- **Request Body:**
```typescript
{
  submitted_by: string;              // required
}
```
- **Response (200):**
```typescript
{
  success: true;
  data: {
    member_id: string;
    agreement_id: number;
    status: "pending";
    contract_id: number;
    next_step: "signature_collection";
  };
}
```
- **Errors:**
  - 400: `INVALID_STATUS` (not in draft), `CONTRACT_REQUIRED`
  - 404: `NOT_FOUND`

#### `PUT /api/agreements/founder/milestones/:milestoneId`
Update a milestone.

- **Auth:** `admin`
- **Params:** `milestoneId` (number)
- **Request Body:**
```typescript
{
  title?: string;
  description?: string;
  target_date?: string;
  token_amount?: number;
}
```
- **Response (200):** `{ success: true, data: Milestone }`
- **Errors:**
  - 400: `MILESTONE_COMPLETED` (cannot edit completed)
  - 404: `NOT_FOUND`

#### `PATCH /api/agreements/founder/milestones/:milestoneId/complete`
Mark milestone as complete.

- **Auth:** `admin`
- **Params:** `milestoneId` (number)
- **Request Body:**
```typescript
{
  completed_by: string;              // required
  completion_notes?: string;
}
```
- **Response (200):** `{ success: true, data: Milestone }`
- **Errors:**
  - 400: `MISSING_FIELDS`, `ALREADY_COMPLETED`
  - 404: `NOT_FOUND`

#### `DELETE /api/agreements/founder/milestones/:milestoneId`
Delete a milestone.

- **Auth:** `admin`
- **Params:** `milestoneId` (number)
- **Response (200):** `{ success: true, data: { milestone_id: string, deleted: true } }`
- **Errors:**
  - 400: `MILESTONE_COMPLETED`
  - 404: `NOT_FOUND`

---

### 4.6 Advisor Agreements

**Base Path:** `/api/agreements/advisor`

#### `GET /api/agreements/advisor`
List all advisor agreements.

- **Auth:** None
- **Query Params:** `dao_id` (number, optional)
- **Response (200):** `{ success: true, data: CouncilMember[], count: number }`

#### `GET /api/agreements/advisor/:id`
Get a specific advisor agreement with milestones, bonus milestones, engagements, and contracts.

- **Auth:** None
- **Params:** `id` (number)
- **Response (200):**
```typescript
{
  success: true;
  data: {
    ...CouncilMember;
    agreement_details: {
      advisor_type: string;
      term_months: number;
      token_structure: {
        starting_grant: number;
        milestone_allocation: number;
        bonus_pool: number;
        total: number;
      };
      engagement_expectations: string;
      rules_terms: string;
      legal_framework: string;
    } | null;
    milestones: Milestone[];
    bonus_milestones: BonusMilestone[];
    engagements: AdvisorEngagement[];
    contracts: GeneratedContract[];
  };
}
```

#### `POST /api/agreements/advisor`
Create a new advisor agreement.

- **Auth:** `admin` / `founder`
- **Request Body:**
```typescript
{
  dao_id: number;                    // required
  personal_details: {                // required
    name: string;
    surname: string;
    email: string;
    wallet_address: string;          // min 32 chars
    phone?: string;
    photo_url?: string;
    custom_description?: string;
  };
  advisor_type: "strategic" | "creative" | "legal" | "fundraising" | "technical" | "other";  // required
  term_months?: number;              // default 12
  token_structure: {                 // required
    starting_grant: number;          // required
    milestone_allocation: number;    // required
    bonus_pool: number;              // required
  };
  engagement_expectations?: string;
  milestones?: Array<{              // max 12
    title: string;
    description?: string;
    milestone_order?: number;
    target_date?: string;
    token_amount?: number;
  }>;
  bonus_milestones?: Array<{        // total token_amount must <= bonus_pool
    trigger_condition: string;
    description: string;
    token_amount: number;
  }>;
  rules_terms?: string;
  legal_framework: string;           // required
}
```
- **Response (201):**
```typescript
{
  success: true;
  data: {
    agreement_id: number;
    member_id: number;
    advisor_type: string;
    token_structure: {
      starting_grant: number;
      milestone_allocation: number;
      bonus_pool: number;
      total: number;
    };
    next_step: "contract_generation";
  };
}
```
- **Errors:** `MISSING_FIELDS`, `INVALID_ADVISOR_TYPE`, `MISSING_TOKEN_STRUCTURE`, `INVALID_WALLET_ADDRESS`, `EMAIL_DUPLICATE`, `DAO_NOT_FOUND`, `INSUFFICIENT_TOKENS` (15% advisor pool), `MAX_MILESTONES_EXCEEDED`, `BONUS_EXCEEDS_POOL`

#### `POST /api/agreements/advisor/:agreementId/generate-contract`
Generate AI advisor contract.

- **Auth:** `admin`
- **Params:** `agreementId` (number)
- **Request Body:** `{ custom_terms?: string }`
- **Response (201):** `{ success: true, data: { contract_id, status: "generated", contract_version, estimated_time_seconds: 0 } }`
- **Errors:** `AGREEMENT_NOT_FOUND`, `MEMBER_NOT_FOUND`, `WRONG_AGREEMENT_TYPE`, `CONTRACT_GENERATION_FAILED`

#### `PUT /api/agreements/advisor/:id/status`
Update advisor agreement status.

- **Auth:** `admin`
- **Params:** `id` (number)
- **Request Body:** `{ status: string, reason?: string, changed_by: string }`
- **Valid Statuses:** `draft`, `pending`, `signed`, `active`, `completed`, `cancelled`
- **Response (200):** `{ success: true, data: { member_id, agreement_id, from_status, to_status, updated_at } }`

#### `POST /api/agreements/advisor/:id/engagements`
Record an advisor engagement.

- **Auth:** `admin` / `founder`
- **Params:** `id` (number) - Advisor council member ID
- **Request Body:**
```typescript
{
  engagement_type: "check_in" | "heads_up" | "high_value_intro" | "strategic_review" | "talent_scouting" | "other";  // required
  date: string;                      // required, ISO date
  description: string;               // required
  value_delivered?: string;
}
```
- **Response (201):**
```typescript
{
  success: true;
  data: {
    engagement_id: number;
    advisor_id: string;
    engagement_type: string;
    date: string;
  };
}
```

#### `PUT /api/agreements/advisor/bonus/:bonusId/trigger`
Trigger a bonus milestone.

- **Auth:** `admin`
- **Params:** `bonusId` (number)
- **Request Body:**
```typescript
{
  verified_by: string;               // required
  verification_notes?: string;
}
```
- **Response (200):** `{ success: true, data: BonusMilestone }`
- **Errors:** `NOT_FOUND`, `INVALID_STATUS` (must be "active")

---

### 4.7 Contributor Agreements

**Base Path:** `/api/agreements/contributor`

#### `GET /api/agreements/contributor`
List all contributor agreements.

- **Auth:** None
- **Query Params:** `dao_id` (optional)
- **Response (200):** `{ success: true, data: CouncilMember[], count: number }`

#### `GET /api/agreements/contributor/:id`
Get specific contributor agreement with deliverables.

- **Auth:** None
- **Params:** `id` (number)
- **Response (200):**
```typescript
{
  success: true;
  data: {
    ...CouncilMember;
    agreement_details: {
      contribution_type: "time" | "materials" | "services";
      contribution_description: string;
      duration_or_delivery_window: string;
      already_started: boolean;
      progress_description: string | null;
      token_structure: {
        total_value: number;
        immediate_grant: number;
        milestone_based: number;
      };
      equity_in_kind_terms: string | null;
      rules_terms: string;
      legal_framework: string;
    } | null;
    milestones: Milestone[];
    deliverables: ContributorDeliverable[];
    contracts: GeneratedContract[];
  };
}
```

#### `POST /api/agreements/contributor`
Create a new contributor agreement.

- **Auth:** `admin` / `founder`
- **Request Body:**
```typescript
{
  dao_id: number;                    // required
  personal_details: {                // required
    name: string;
    surname: string;
    email: string;
    wallet_address: string;          // min 32 chars
    phone?: string;
    photo_url?: string;
  };
  contribution_type: "time" | "materials" | "services";  // required
  contribution_description?: string;
  duration_or_delivery_window?: string;
  already_started?: boolean;
  progress_description?: string;     // recommended if already_started
  token_structure: {                 // required
    total_value: number;             // required
    immediate_grant?: number;        // default 0, must <= total_value
  };
  deliverables?: Array<{
    description: string;
    delivery_window?: string;
    milestone_id?: number;
    progress_description?: string;
    completion_percentage?: number;
  }>;
  equity_in_kind_terms?: string;
  rules_terms?: string;
  legal_framework: string;           // required
}
```
- **Response (201):**
```typescript
{
  success: true;
  data: {
    agreement_id: number;
    member_id: number;
    contribution_type: string;
    token_structure: {
      total_value: number;
      immediate_grant: number;
      milestone_based: number;
    };
    next_step: "contract_generation";
  };
}
```
- **Errors:** `MISSING_FIELDS`, `INVALID_CONTRIBUTION_TYPE`, `MISSING_TOKEN_STRUCTURE`, `INVALID_IMMEDIATE_GRANT`, `INVALID_WALLET_ADDRESS`, `EMAIL_DUPLICATE`, `DAO_NOT_FOUND`, `INSUFFICIENT_TOKENS` (20% contributor pool)

#### `POST /api/agreements/contributor/:agreementId/generate-contract`
Generate AI contributor contract.

- **Auth:** `admin`
- **Params:** `agreementId` (number)
- **Request Body:** `{ custom_terms?: string }`
- **Response (201):** Same as other contract generation endpoints
- **Errors:** `AGREEMENT_NOT_FOUND`, `MEMBER_NOT_FOUND`, `WRONG_AGREEMENT_TYPE`, `CONTRACT_GENERATION_FAILED`

#### `PUT /api/agreements/contributor/:id/status`
Update contributor agreement status.

- **Auth:** `admin`
- **Params:** `id` (number)
- **Request Body:** `{ status: string, reason?: string, changed_by: string }`
- **Valid Statuses:** `draft`, `pending`, `signed`, `active`, `completed`, `cancelled`
- **Response (200):** Standard status update response

#### `PUT /api/agreements/contributor/deliverables/:deliverableId`
Update a deliverable.

- **Auth:** `admin` / `council`
- **Params:** `deliverableId` (number)
- **Request Body:**
```typescript
{
  description?: string;
  delivery_window?: string;
  completion_percentage?: number;    // 0-100
  status?: "pending" | "in_progress" | "delivered" | "verified" | "rejected";
}
```
- **Response (200):** `{ success: true, data: ContributorDeliverable }`
- **Errors:** `NOT_FOUND`, `DELIVERABLE_VERIFIED`, `INVALID_PERCENTAGE`, `INVALID_STATUS`

#### `PUT /api/agreements/contributor/deliverables/:deliverableId/verify`
Verify a deliverable.

- **Auth:** `admin` / `founder`
- **Params:** `deliverableId` (number)
- **Request Body:**
```typescript
{
  verified_by: string;               // required
  verification_notes?: string;
  approved?: boolean;                // default true; false = rejected
}
```
- **Response (200):** `{ success: true, data: ContributorDeliverable }`
- **Errors:** `NOT_FOUND`, `INVALID_STATUS` (must be "delivered"), `MISSING_FIELDS`

---

### 4.8 First Born Agreements

**Base Path:** `/api/agreements/firstborn`

#### `GET /api/agreements/firstborn`
List all first born (early investor) agreements.

- **Auth:** None
- **Query Params:** `dao_id` (optional)
- **Response (200):** `{ success: true, data: CouncilMember[], count: number }`

#### `GET /api/agreements/firstborn/:id`
Get specific first born agreement with vesting schedule.

- **Auth:** None
- **Params:** `id` (number)
- **Response (200):**
```typescript
{
  success: true;
  data: {
    ...CouncilMember;
    agreement_details: {
      capital_contribution: {
        amount: number;
        currency: string;
        transaction_hash: string | null;
      };
      token_reward: {
        amount: number;
        vesting_months: number;
        cliff_months: number;
      };
      cultural_benefits: string[];
      legal_framework: string;
    } | null;
    vesting_schedule: Array<{
      id: number;
      release_date: string;
      token_amount: number;
      release_type: "cliff" | "vesting";
      status: "scheduled" | "released";
    }>;
    contracts: GeneratedContract[];
  };
}
```

#### `POST /api/agreements/firstborn`
Create a new first born investment agreement.

- **Auth:** `admin` / `founder`
- **Request Body:**
```typescript
{
  dao_id: number;                    // required
  personal_details: {                // required
    name: string;
    surname: string;
    email: string;
    wallet_address: string;          // min 32 chars
    phone?: string;
    photo_url?: string;
  };
  capital_contribution: {            // required
    amount: number;                  // > 0
    currency: "USD" | "USDC" | "USDT" | "ETH" | "BTC" | "SOL";  // required
    transaction_hash?: string;
  };
  token_reward: {                    // required
    amount: number;                  // > 0
    vesting_months: number;          // >= 1
    cliff_months?: number;           // default 0
  };
  cultural_benefits?: string[];      // valid: voting_rights, early_access, founder_recognition, governance_participation, exclusive_updates, network_access, advisory_board_seat, product_input, custom:*
  legal_framework: string;           // required
}
```
- **Response (201):**
```typescript
{
  success: true;
  data: {
    agreement_id: number;
    member_id: number;
    capital_contribution: { amount: number; currency: string };
    token_reward: { amount: number; vesting_months: number; cliff_months: number };
    next_step: "contract_generation";
  };
}
```
- **Errors:** `MISSING_FIELDS`, `INVALID_CONTRIBUTION_AMOUNT`, `INVALID_CURRENCY`, `INVALID_TOKEN_AMOUNT`, `INVALID_VESTING_PERIOD`, `INVALID_WALLET_ADDRESS`, `EMAIL_DUPLICATE`, `DAO_NOT_FOUND`, `INSUFFICIENT_TOKENS` (10% firstborn pool), `INVALID_CULTURAL_BENEFITS`

#### `POST /api/agreements/firstborn/:agreementId/generate-contract`
Generate AI first born investment contract.

- **Auth:** `admin`
- **Params:** `agreementId` (number)
- **Request Body:** `{ custom_terms?: string }`
- **Response (201):** Standard contract generation response
- **Errors:** `AGREEMENT_NOT_FOUND`, `MEMBER_NOT_FOUND`, `WRONG_AGREEMENT_TYPE`, `CONTRACT_GENERATION_FAILED`

#### `PUT /api/agreements/firstborn/:id/status`
Update first born agreement status.

- **Auth:** `admin`
- **Params:** `id` (number)
- **Request Body:** `{ status: string, reason?: string, changed_by: string }`
- **Response (200):** Standard status update response

#### `GET /api/agreements/firstborn/:id/vesting`
Get vesting schedule for a first born member.

- **Auth:** None
- **Params:** `id` (number)
- **Response (200):**
```typescript
{
  success: true;
  data: {
    member_id: string;
    total_allocation: number;
    total_scheduled: number;
    total_released: number;
    total_pending: number;
    next_release: {
      id: number;
      release_date: string;
      token_amount: number;
      release_type: string;
      status: string;
    } | null;
    schedule: VestingEntry[];
  };
}
```

#### `PUT /api/agreements/firstborn/:id/vesting/:releaseId/release`
Mark a vesting release as completed.

- **Auth:** `admin`
- **Params:** `id` (number), `releaseId` (number)
- **Request Body:**
```typescript
{
  released_by: string;               // required
  transaction_hash?: string;
}
```
- **Response (200):** `{ success: true, data: VestingEntry }`
- **Errors:** `NOT_FOUND`, `RELEASE_NOT_FOUND`, `ALREADY_RELEASED`, `MISSING_FIELDS`

---

### 4.9 Contracts

**Base Path:** `/api/contracts`

#### `GET /api/contracts/:contractId`
Get a generated contract.

- **Auth:** None
- **Params:** `contractId` (number)
- **Response (200):**
```typescript
{
  success: true;
  data: {
    contract_id: number;
    status: "generated" | "approved" | "failed";
    contract_text: string;
    contract_version: number;
    agreement_type: string;
    legal_framework: string;
    generated_at: string;
    generated_by: string;
    approved_by: string | null;
    approved_at: string | null;
    error_message: string | null;
  };
}
```
- **Error (404):** `CONTRACT_NOT_FOUND`

#### `POST /api/contracts/:contractId/regenerate`
Regenerate a contract with a new version.

- **Auth:** `admin`
- **Params:** `contractId` (number)
- **Request Body:** `{ custom_terms?: string }`
- **Response (201):**
```typescript
{
  success: true;
  data: {
    contract_id: number;
    contract_version: number;
    status: "generated";
    previous_contract_id: string;
  };
}
```
- **Errors:** `CONTRACT_NOT_FOUND`, `DATA_NOT_FOUND`, `CONTRACT_REGENERATION_FAILED`

#### `POST /api/contracts/:contractId/approve`
Approve a generated contract.

- **Auth:** `admin` / `founder`
- **Params:** `contractId` (number)
- **Request Body:** `{ approved_by?: string }`
- **Response (200):**
```typescript
{
  success: true;
  data: {
    contract_id: string;
    status: "approved";
    approved_at: string;
  };
}
```
- **Errors:** `CONTRACT_NOT_FOUND`, `ALREADY_APPROVED`

---

### 4.10 Signatures

**Base Path:** `/api/signatures`

#### `POST /api/signatures/sign`
Sign an agreement (as DAO or member).

- **Auth:** `member` / `admin`
- **Request Body:**
```typescript
{
  agreementId: string;               // required
  signerType: "dao" | "member";      // required
  signature: string;                 // required
  signerAddress: string;             // required (Solana public key)
  linkId?: string;                   // optional, for member signing via link
}
```
- **Response (200):**
```typescript
{
  success: true;
  message: "Agreement signed by <signerType>";
  signatureStatus: {
    dao: { signedAt: string; signerAddress: string } | null;
    member: { signedAt: string; signerAddress: string } | null;
    fullyExecuted: boolean;
    activatedAt: string | null;
  };
  activated: boolean;
}
```
- **Errors:**
  - 400: Missing fields, cannot sign, link mismatch

#### `GET /api/signatures/status/:agreementId`
Get signature status for an agreement.

- **Auth:** None
- **Params:** `agreementId` (string)
- **Response (200):**
```typescript
{
  agreementId: string;
  dao: { signedAt: string; signerAddress: string } | null;
  member: { signedAt: string; signerAddress: string } | null;
  fullyExecuted: boolean;
  activatedAt: string | null;
  requiredSignatures: 2;
  collectedSignatures: number;       // 0, 1, or 2
}
```

#### `POST /api/signatures/link/generate`
Generate a signing link for a member.

- **Auth:** `admin`
- **Request Body:** `{ agreementId: string }`
- **Response (200):**
```typescript
{
  success: true;
  link: {
    id: string;
    url: string;
    expiresAt: string;
    agreementId: string;
  };
}
```

#### `GET /api/signatures/link/:linkId`
Validate and get link details (public signing page).

- **Auth:** None (public)
- **Params:** `linkId` (string)
- **Response (200):**
```typescript
{
  valid: true;
  linkId: string;
  agreementId: string;
  agreement: {
    id: string;
    title: string;
    type: string;
    status: string;
    party: { name: string; role: string };
    details: {
      tokenAllocation: number;
      vestingSchedule: any;
      termMonths: number;
      responsibilities: any;
    };
    daoSignature: { signedAt: string; signerAddress: string } | null;
  } | null;
  signatureStatus: {
    daoSigned: boolean;
    memberSigned: boolean;
  };
}
```
- **Error (400):** `{ valid: false, error: string }`

#### `POST /api/signatures/verify`
Verify a cryptographic signature.

- **Auth:** None
- **Request Body:**
```typescript
{
  message: string;                   // required
  signature: string;                 // required
  signerAddress: string;             // required
  chainType?: "solana" | "ethereum"; // default "solana"
}
```
- **Response (200):**
```typescript
{
  valid: boolean;
  message: string;
  signerAddress: string;
  chainType: string;
}
```

#### `GET /api/signatures/agreement/:agreementId`
Get agreement details for signing (public endpoint).

- **Auth:** None
- **Params:** `agreementId` (string)
- **Response (200):**
```typescript
{
  id: string;
  title: string;
  type: string;
  status: string;
  party: { name: string; role: string; email: string };
  details: {
    tokenAllocation: number;
    vestingSchedule: any;
    termMonths: number;
    responsibilities: any;
    deliverables: any;
  };
  signatureStatus: {
    dao: { signedAt: string; signerAddress: string } | null;
    member: { signedAt: string; signerAddress: string } | null;
    fullyExecuted: boolean;
    activatedAt: string | null;
  };
  createdAt: string;
}
```

#### `GET /api/signatures/history/:agreementId`
Get signature history/timeline for an agreement.

- **Auth:** None
- **Params:** `agreementId` (string)
- **Response (200):**
```typescript
{
  agreementId: string;
  history: Array<{
    event: "agreement_created" | "dao_signed" | "member_signed" | "agreement_activated" | "signing_link_created" | "signing_link_used";
    timestamp: string;
    description: string;
    actor?: string;
    actorType?: "dao" | "member";
    linkId?: string;
    expiresAt?: string;
    used?: boolean;
  }>;
}
```

---

### 4.11 Milestones

**Base Path:** `/api/milestones`

#### `GET /api/milestones`
List all milestones with optional filters.

- **Auth:** None
- **Query Params:**
  - `agreement_id` (number, optional)
  - `council_member_id` (number, optional)
  - `status` (string, optional) - `pending`, `in_progress`, `completed`
  - `dao_id` (number, optional)
- **Response (200):**
```typescript
{
  success: true;
  data: Array<{
    id: number;
    agreement_id: number;
    council_member_id: number;
    title: string;
    description: string | null;
    milestone_order: number;
    target_date: string | null;
    token_amount: number | null;
    status: "pending" | "in_progress" | "completed";
    completed_date: string | null;
    verified_by: string | null;
    completion_notes: string | null;
    created_at: string;
    updated_at: string;
    member_name: string;
    member_surname: string;
    agreement_title: string;
  }>;
  count: number;
}
```

#### `GET /api/milestones/:id`
Get a single milestone with token release info.

- **Auth:** None
- **Params:** `id` (number)
- **Response (200):**
```typescript
{
  success: true;
  data: {
    ...Milestone;
    member_name: string;
    member_surname: string;
    wallet_address: string;
    agreement_title: string;
    agreement_status: string;
    token_release: {
      id: number;
      release_date: string;
      token_amount: number;
      release_type: string;
      status: string;
    } | null;
  };
}
```

#### `POST /api/milestones`
Create a new milestone.

- **Auth:** `admin` / `council`
- **Request Body:**
```typescript
{
  agreement_id: number;              // required
  council_member_id: number;         // required
  title: string;                     // required
  description?: string;
  milestone_order?: number;          // auto-calculated if omitted, max 12
  target_date?: string;
  token_amount?: number;
}
```
- **Response (201):**
```typescript
{
  success: true;
  data: {
    id: number;
    title: string;
    milestone_order: number;
    status: "pending";
  };
}
```
- **Errors:** `MISSING_FIELDS`, `AGREEMENT_NOT_FOUND`, `MEMBER_NOT_FOUND`, `MAX_MILESTONES_EXCEEDED`

#### `PUT /api/milestones/:id`
Update a milestone.

- **Auth:** `admin`
- **Params:** `id` (number)
- **Request Body:** `{ title?, description?, target_date?, token_amount?, milestone_order? }`
- **Response (200):** `{ success: true, data: Milestone }`
- **Errors:** `NOT_FOUND`, `MILESTONE_COMPLETED`

#### `PUT /api/milestones/:id/complete`
Mark a milestone as complete (triggers token release).

- **Auth:** `admin`
- **Params:** `id` (number)
- **Request Body:**
```typescript
{
  verified_by: string;               // required
  completion_notes?: string;
}
```
- **Response (200):**
```typescript
{
  success: true;
  data: {
    milestone_id: string;
    status: "completed";
    completed_date: string;
    tokens_released: number;
    all_milestones_complete: boolean;
  };
}
```

#### `DELETE /api/milestones/:id`
Delete a milestone.

- **Auth:** `admin`
- **Params:** `id` (number)
- **Response (200):** `{ success: true, data: { deleted_id: string } }`
- **Errors:** `NOT_FOUND`, `MILESTONE_COMPLETED`

#### `GET /api/milestones/member/:memberId`
Get all milestones for a council member (with overdue flags).

- **Auth:** None
- **Params:** `memberId` (number)
- **Response (200):**
```typescript
{
  success: true;
  data: Array<Milestone & { is_overdue: boolean }>;
  count: number;
}
```

#### `GET /api/milestones/stats/:memberId`
Get milestone progress stats for a member.

- **Auth:** None
- **Params:** `memberId` (number)
- **Response (200):**
```typescript
{
  success: true;
  data: {
    total: number;
    completed: number;
    pending: number;
    overdue: number;
    percentage: number;              // 0-100
    tokens_released: number;
    tokens_remaining: number;
    tokens_total: number;
    next_milestone: Milestone | null;
    overdue_milestones: Milestone[];
  };
}
```

#### `PUT /api/milestones/reorder`
Reorder milestones for a member.

- **Auth:** `admin`
- **Request Body:**
```typescript
{
  council_member_id: number;         // required
  milestone_ids: number[];           // required, ordered array
}
```
- **Response (200):** `{ success: true, data: { reordered: number } }`
- **Errors:** `MISSING_FIELDS`, `INVALID_MILESTONE_IDS`

---

### 4.12 Proposals

**Base Path:** `/api/proposals`

#### `GET /api/proposals`
Get all governance proposals.

- **Auth:** None
- **Response (200):** Array of proposals with parsed `proposer` field
```typescript
Array<{
  id: string;
  title: string;
  description: string;
  proposer: { name: string; avatarUrl: string };
  status: "Active" | "Passed" | "Failed" | "Rejected" | "Queued";
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  endDate: string;
  quorum: number;
}>
```

#### `GET /api/proposals/:id/vote`
Get a user's vote on a proposal.

- **Auth:** None
- **Params:** `id` (string)
- **Query Params:** `voterAddress` (string, required)
- **Response (200):**
```typescript
{
  proposalId: string;
  voterAddress: string;
  hasVoted: boolean;
  vote: "for" | "against" | "abstain" | null;
  votingPower?: number;
  votedAt?: string;
}
```
- **Error (400):** Missing `voterAddress`
- **Error (404):** Proposal not found

#### `POST /api/proposals/:id/vote`
Cast a vote on a proposal.

- **Auth:** `member`
- **Params:** `id` (string)
- **Request Body:**
```typescript
{
  voteType: "for" | "against" | "abstain";  // required
  votingPower: number;               // required, > 0
  voterAddress: string;              // required, valid address
}
```
- **Response (200):** Updated proposal with parsed `proposer`
- **Errors:**
  - 400: Voting period ended, already voted, validation errors
  - 404: Proposal not found

#### `POST /api/proposals/:id/finalize`
Finalize a proposal after voting period ends.

- **Auth:** `admin`
- **Params:** `id` (string)
- **Response (200):**
```typescript
{
  message: "Proposal finalized";
  proposal: Proposal;
  result: {
    proposalId: string;
    status: "Passed" | "Failed" | "Rejected";
    totalVotes: number;
    quorumReached: boolean;
  };
}
```
- **Errors:**
  - 400: Already finalized, voting period still active
  - 404: Proposal not found

---

### 4.13 Treasury

**Base Path:** `/api/treasury`

#### `GET /api/treasury/vitals`
Get treasury overview.

- **Auth:** None
- **Response (200):**
```typescript
{
  balance: number;                   // calculated from transaction history
  policy: {
    requiredSignatures: number;
    totalSigners: number;
  };
  signers: Array<{
    address: string;
    name: string;
    role: string;
  }>;
}
```

#### `GET /api/treasury/transactions`
Get all treasury transactions with approvals.

- **Auth:** None
- **Response (200):**
```typescript
Array<{
  id: string;
  recipient: string;
  recipientName: string;
  amount: number;
  memo: string;
  status: "Pending" | "Executed" | "Rejected";
  approvals: string[];               // array of signer addresses
  dateInitiated: string;
  dateExecuted: string | null;
}>
```

#### `POST /api/treasury/transactions`
Create a new treasury transaction (withdrawal request).

- **Auth:** `founder` / `admin`
- **Request Body:**
```typescript
{
  recipient: string;                 // valid address, required
  recipientName?: string;            // 1-100 chars
  amount: number;                    // > 0, required, must <= treasury balance
  memo: string;                      // 3-500 chars, required
}
```
- **Response (201):** Transaction object with `approvals: []`
- **Errors:**
  - 400: Validation errors, insufficient balance

#### `POST /api/treasury/transactions/:id/approve`
Approve a pending treasury transaction.

- **Auth:** `founder` (must be authorized signer)
- **Params:** `id` (string)
- **Request Body:**
```typescript
{
  signer_address: string;            // required, valid address
}
```
- **Response (200):** Transaction with updated approvals (may auto-execute if threshold met)
- **Errors:**
  - 400: Transaction not pending, already approved
  - 403: Not an authorized signer
  - 404: Transaction not found
  - 409: Duplicate approval

#### `POST /api/treasury/deposit`
Record an incoming deposit.

- **Auth:** `admin`
- **Request Body:**
```typescript
{
  amount: number;                    // > 0, required
  source: string;                    // 1-50 chars, required
  reference?: string;
  memo?: string;                     // max 500 chars
}
```
- **Response (201):**
```typescript
{
  success: true;
  deposit: {
    id: string;
    amount: number;
    source: string;
    reference: string | null;
    status: "Executed";
    timestamp: string;
  };
  treasuryBalance: number;
}
```

#### `POST /api/treasury/transactions/:id/reject`
Reject a pending transaction.

- **Auth:** `admin` / `founder`
- **Params:** `id` (string)
- **Response (200):** Transaction with `status: "Rejected"`
- **Errors:**
  - 400: Transaction not pending
  - 404: Transaction not found

---

### 4.14 Tokens

**Base Path:** `/api/tokens`

#### `GET /api/tokens/balance/:userId`
Get user's token balance.

- **Auth:** None
- **Params:** `userId` (string)
- **Response (200):**
```typescript
{
  userId: string;
  sodaBalance: number;
  bubbleScore: number;
}
```
- **Note:** Creates user with 0 balance if not found

#### `POST /api/tokens/transfer`
Transfer tokens between users.

- **Auth:** `member`
- **Request Body:**
```typescript
{
  fromUser: string;                  // required
  toUser: string;                    // required
  amount: number;                    // required, > 0
  memo?: string;
}
```
- **Response (200):**
```typescript
{
  success: true;
  transactionId: string;
  senderNewBalance: number;
  receiverNewBalance: number;
}
```
- **Error (400):** Invalid request, insufficient balance

#### `POST /api/tokens/reward`
Reward tokens to a user (system action).

- **Auth:** `admin`
- **Request Body:**
```typescript
{
  userId: string;                    // required
  amount: number;                    // required, > 0
  reason?: string;
  referenceId?: string;
}
```
- **Response (200):**
```typescript
{
  success: true;
  transactionId: string;
  newBalance: number;
  bubbleScore: number;
}
```

#### `GET /api/tokens/transactions/:userId`
Get transaction history for a user.

- **Auth:** `member` (own) / `admin`
- **Params:** `userId` (string)
- **Query Params:** `limit` (number, default 50)
- **Response (200):** Array of token transactions
```typescript
Array<{
  id: string;
  from_user: string;
  to_user: string;
  amount: number;
  transaction_type: "transfer" | "reward" | "marketplace_purchase";
  reference_id: string | null;
  memo: string;
  status: "completed";
  created_at: string;
}>
```

#### `POST /api/tokens/bubble-score`
Update a user's bubble score.

- **Auth:** `admin`
- **Request Body:**
```typescript
{
  userId: string;                    // required
  points: number;                    // required
  action?: string;
}
```
- **Response (200):**
```typescript
{
  success: true;
  newBubbleScore: number;
  action: string;
}
```

---

### 4.15 Token Distribution

**Base Path:** `/api/token-distribution`

#### `GET /api/token-distribution`
Get all token distribution groups.

- **Auth:** None
- **Response (200):**
```typescript
Array<{
  id: string;
  groupName: string;
  percentage: number;
  totalTokens: number;
  vestingPeriod: string;
  claimed: number;
}>
```

#### `GET /api/token-distribution/:groupId/vested`
Get vesting info for a user in a distribution group.

- **Auth:** `member`
- **Params:** `groupId` (string)
- **Query Params:** `userId` (string, required)
- **Response (200):**
```typescript
{
  groupName: string;
  totalAllocated: number;
  vestedAmount: number;
  claimedAmount: number;
  availableToClaim: number;
  vestingSchedule: string;
  nextUnlock: string | null;
  nextUnlockAmount: number;
}
```
- **Errors:**
  - 400: Missing `userId`
  - 404: Group not found, no vesting schedule

#### `POST /api/token-distribution/:groupId/claim`
Claim vested tokens.

- **Auth:** `member`
- **Params:** `groupId` (string)
- **Request Body:**
```typescript
{
  userId: string;                    // required
  amount: number;                    // required, > 0
}
```
- **Response (200):**
```typescript
{
  success: true;
  claimed: number;
  newBalance: number;
  remainingVested: number;
  transaction: {
    id: string;
    timestamp: string;
  };
}
```
- **Error (400):** Claim exceeds available vested tokens

#### `POST /api/token-distribution/schedule`
Create a new vesting schedule.

- **Auth:** `admin`
- **Request Body:**
```typescript
{
  userId: string;                    // required
  groupId: string;                   // required
  totalTokens: number;              // required, > 0
  startDate: string;                 // required, ISO date
  cliffMonths?: number;
  vestingMonths: number;             // required, > 0
  cliffPercentage?: number;          // default 25
}
```
- **Response (201):**
```typescript
{
  success: true;
  schedule: {
    id: string;
    userId: string;
    groupId: string;
    totalTokens: number;
    startDate: string;
    cliffDate: string | null;
    endDate: string;
    cliffPercentage: number;
  };
  unlocks: Array<{ date: string; amount: number; claimed: boolean }>;
  message: string;
}
```
- **Errors:**
  - 400: Missing/invalid fields
  - 404: Group not found
  - 409: Schedule already exists

#### `GET /api/token-distribution/history`
Get vesting claim history.

- **Auth:** None
- **Query Params:** `userId` (optional), `groupId` (optional)
- **Response (200):**
```typescript
{
  success: true;
  data: Array<{
    id: string;
    schedule_id: string;
    unlock_date: string;
    amount: number;
    claimed: boolean;
    user_id: string;
    group_id: string;
    groupName: string;
  }>;
}
```

---

### 4.16 Marketplace

**Base Path:** `/api/marketplace`

#### `GET /api/marketplace/items`
Get marketplace items.

- **Auth:** None
- **Query Params:**
  - `type` (optional) - `NFT`, `Ticket`, `Merch`, or `All`
  - `status` (optional) - default `active`
- **Response (200):**
```typescript
Array<{
  id: string;
  name: string;
  type: "NFT" | "Ticket" | "Merch";
  price: number;
  imageUrl: string | null;
  description: string | null;
  category: string | null;
  creator: { name: string; avatarUrl: string | null };
  edition?: { current: number; total: number };
  status: "active" | "sold_out";
  quantity: number;
  soldCount: number;
}>
```

#### `GET /api/marketplace/items/:id`
Get a single marketplace item.

- **Auth:** None
- **Params:** `id` (string)
- **Response (200):** MarketplaceItem
- **Error (404):** `{ error: "Item not found" }`

#### `POST /api/marketplace/items`
Create a marketplace listing.

- **Auth:** `member`
- **Request Body:**
```typescript
{
  name: string;                      // required
  type: "NFT" | "Ticket" | "Merch"; // required
  price: number;                     // required, > 0
  sellerId: string;                  // required
  description?: string;
  imageUrl?: string;
  category?: string;
  quantity?: number;                 // default 1
  creatorName?: string;              // default "Unknown"
  creatorAvatarUrl?: string;
  editionTotal?: number;
}
```
- **Response (201):** MarketplaceItem

#### `POST /api/marketplace/items/:itemId/purchase`
Purchase an item.

- **Auth:** `member`
- **Params:** `itemId` (string)
- **Request Body:**
```typescript
{
  buyerId: string;                   // required
  quantity: number;                  // required, > 0
}
```
- **Response (200):**
```typescript
{
  success: true;
  purchase: {
    id: string;
    itemId: string;
    itemName: string;
    buyer: string;
    seller: string;
    price: number;
    quantity: number;
    totalCost: number;
    transactionId: string;
    timestamp: string;
  };
  newBalance: number;
  itemStatus: "active" | "sold_out";
}
```
- **Errors:**
  - 400: Missing fields, item not found, insufficient quantity, insufficient balance

#### `POST /api/marketplace/purchase`
Legacy purchase endpoint (backward compat).

- **Auth:** `member`
- **Request Body:** `{ itemId, buyerId, quantity }` - same as above
- **Response:** Same as above

#### `GET /api/marketplace/purchases/:userId`
Get user's purchased items.

- **Auth:** `member`
- **Params:** `userId` (string)
- **Query Params:** `limit` (default 50)
- **Response (200):**
```typescript
Array<{
  id: string;
  purchasedAt: string;
  totalCost: number;
  quantity: number;
  item: {
    id: string;
    name: string;
    type: string;
    imageUrl: string;
    category: string;
    creator: { name: string; avatarUrl: string };
  };
}>
```

#### `GET /api/marketplace/listings/:userId`
Get items a user is selling.

- **Auth:** `member`
- **Params:** `userId` (string)
- **Response (200):** Array of MarketplaceItem

#### `GET /api/marketplace/balance/:wallet`
Get wallet balance for marketplace.

- **Auth:** None
- **Params:** `wallet` (string)
- **Response (200):**
```typescript
{
  userId: string;
  balance: number;
  bubbleScore: number;
}
```

#### `GET /api/marketplace/history/:wallet`
Get purchase history for wallet (alias for `/purchases/:userId`).

- **Auth:** None
- **Params:** `wallet` (string)
- **Query Params:** `limit` (default 50)
- **Response (200):** Same as `/purchases/:userId`

---

### 4.17 Gemini / Mentor

**Base Path:** `/api/gemini` and `/api/mentor` (same router)

#### `POST /api/mentor/chat`
Send a message to the AI mentor.

- **Auth:** `member`
- **Request Body:**
```typescript
{
  sessionId: string;                 // required, non-empty
  prompt: string;                    // required, max 5000 chars
}
```
- **Response (200):** `{ text: string }`
- **Error (400):** Validation errors
- **Error (500):** `{ error: "Failed to generate content from Gemini API" }`

#### `POST /api/gemini/generate`
Generate a legal contract with country-specific framework.

- **Auth:** `member`
- **Request Body:**
```typescript
{
  prompt: string;                    // required, max 10000 chars
  country?: string;                  // optional, max 100 chars
}
```
- **Response (200):** `{ text: string }`

#### `GET /api/gemini/legal-frameworks`
Get all available legal frameworks.

- **Auth:** None
- **Response (200):**
```typescript
{
  frameworks: Array<{
    id: string;
    country: string;
    created_at: string;
    updated_at: string;
  }>;
}
```

#### `GET /api/gemini/legal-frameworks/:country`
Get specific legal framework details.

- **Auth:** None
- **Params:** `country` (string, max 100 chars)
- **Response (200):**
```typescript
{
  framework: {
    id: string;
    country: string;
    governance_clauses: object;
    membership_requirements: object;
    voting_requirements: object;
    treasury_rules: object;
    liability_clauses: object;
    dissolution_rules: object;
    additional_requirements: object | null;
    disclaimers: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  };
}
```
- **Error (404):** `{ error: "Legal framework not found for this country" }`

---

### 4.18 Brain

**Base Path:** `/api/brain`

> **Note:** The `brain.ts` route file is specified in the architecture but not yet implemented in the current codebase. Below is the contract spec for the planned Brain module, which serves as the DAO's collective intelligence and decision-support engine.

#### `GET /api/brain/status`
Get brain module status.

- **Auth:** None
- **Response (200):**
```typescript
{
  success: true;
  data: {
    status: "active" | "idle" | "processing";
    last_activity: string;
    knowledge_items: number;
    active_contexts: number;
  };
}
```

#### `POST /api/brain/query`
Query the DAO brain for insights.

- **Auth:** `member`
- **Request Body:**
```typescript
{
  query: string;                     // required
  context?: string;                  // optional context scope
  dao_id?: number;
}
```
- **Response (200):**
```typescript
{
  success: true;
  data: {
    answer: string;
    sources: Array<{ type: string; id: string; title: string }>;
    confidence: number;
  };
}
```

#### `POST /api/brain/analyze`
Request analysis on DAO data.

- **Auth:** `admin` / `founder`
- **Request Body:**
```typescript
{
  topic: "treasury" | "governance" | "milestones" | "agreements" | "tokenomics";
  dao_id?: number;
  timeframe?: string;
}
```
- **Response (200):**
```typescript
{
  success: true;
  data: {
    summary: string;
    insights: string[];
    recommendations: string[];
    data_points: object;
  };
}
```

---

## 5. New Routes

---

### 5.1 Users

**Base Path:** `/api/users`

> Firebase Auth integrated. All user endpoints require Firebase JWT unless marked public.

#### `POST /api/users`
Register / create a new user (triggered after Firebase Auth signup).

- **Auth:** `member` (Firebase JWT)
- **Request Body:**
```typescript
{
  firebase_uid: string;              // required, from Firebase Auth
  email: string;                     // required
  display_name: string;              // required
  wallet_address?: string;           // Solana public key
  avatar_url?: string;
  bio?: string;
  role?: string;                     // default "member"
}
```
- **Response (201):**
```typescript
{
  success: true;
  data: {
    id: string;                      // internal user ID
    firebase_uid: string;
    email: string;
    display_name: string;
    wallet_address: string | null;
    avatar_url: string | null;
    bio: string | null;
    role: string;
    bubble_score: 0;
    soda_balance: 0;
    onboarding_completed: false;
    created_at: string;
    updated_at: string;
  };
  meta: { timestamp: string };
}
```
- **Errors:**
  - 400: `MISSING_FIELDS`
  - 409: `EMAIL_DUPLICATE`, `FIREBASE_UID_DUPLICATE`

#### `GET /api/users`
List users (admin only, paginated).

- **Auth:** `admin`
- **Query Params:**
  - `page` (number, default 1)
  - `limit` (number, default 50, max 100)
  - `role` (string, optional) - filter by role
  - `search` (string, optional) - search by name/email
  - `status` (string, optional) - `active`, `suspended`, `deactivated`
- **Response (200):**
```typescript
{
  success: true;
  data: User[];
  meta: {
    page: number;
    limit: number;
    total: number;
    timestamp: string;
  };
}
```

#### `GET /api/users/me`
Get the authenticated user's profile.

- **Auth:** `member`
- **Response (200):**
```typescript
{
  success: true;
  data: {
    ...User;
    council_membership: {
      id: number;
      role_type: string;
      status: string;
      token_allocation_total: number;
    } | null;
    recent_activity: Array<{
      type: string;
      description: string;
      timestamp: string;
    }>;
  };
}
```

#### `GET /api/users/:id`
Get a user by ID.

- **Auth:** `member` (own profile) / `admin`
- **Params:** `id` (string)
- **Response (200):** `{ success: true, data: User }`
- **Error (404):** `NOT_FOUND`

#### `PUT /api/users/:id`
Update user profile.

- **Auth:** `member` (own only) / `admin`
- **Params:** `id` (string)
- **Request Body:**
```typescript
{
  display_name?: string;
  avatar_url?: string;
  bio?: string;
  wallet_address?: string;
  phone?: string;
  preferences?: {
    notifications: boolean;
    email_digest: "daily" | "weekly" | "never";
    theme: "light" | "dark" | "system";
    language: string;
  };
}
```
- **Response (200):** `{ success: true, data: User }`
- **Error (403):** Cannot edit other users (unless admin)

#### `DELETE /api/users/:id`
Deactivate a user (soft delete).

- **Auth:** `admin`
- **Params:** `id` (string)
- **Response (200):** `{ success: true, data: { id: string, status: "deactivated" } }`

#### `GET /api/users/by-wallet/:walletAddress`
Find user by wallet address.

- **Auth:** None
- **Params:** `walletAddress` (string)
- **Response (200):** `{ success: true, data: PublicUserProfile }`
- **Error (404):** `NOT_FOUND`

#### `POST /api/users/:id/onboarding`
Mark onboarding as completed and save preferences.

- **Auth:** `member` (own only)
- **Params:** `id` (string)
- **Request Body:**
```typescript
{
  completed_steps: string[];         // list of completed step IDs
  preferences: {
    notifications: boolean;
    email_digest: string;
    interests: string[];
  };
  wallet_connected: boolean;
}
```
- **Response (200):**
```typescript
{
  success: true;
  data: {
    onboarding_completed: true;
    completed_at: string;
  };
}
```

#### `POST /api/users/:id/link-wallet`
Link a Solana wallet to user account (with signature verification).

- **Auth:** `member` (own only)
- **Params:** `id` (string)
- **Request Body:**
```typescript
{
  wallet_address: string;            // required
  signature: string;                 // required, signed message proving ownership
  message: string;                   // required, the message that was signed
}
```
- **Response (200):**
```typescript
{
  success: true;
  data: {
    user_id: string;
    wallet_address: string;
    verified: boolean;
    linked_at: string;
  };
}
```
- **Errors:**
  - 400: Invalid signature
  - 409: Wallet already linked to another user

---

### 5.2 Knowledge

**Base Path:** `/api/knowledge`

> The Knowledge module stores DAO institutional knowledge, governance documents, FAQs, and educational content.

#### `GET /api/knowledge`
List knowledge items (paginated, searchable).

- **Auth:** None (public items) / `member` (private items)
- **Query Params:**
  - `page` (number, default 1)
  - `limit` (number, default 20, max 100)
  - `category` (string, optional) - `governance`, `legal`, `technical`, `faq`, `tutorial`, `policy`
  - `tags` (string, optional) - comma-separated tags
  - `search` (string, optional) - full-text search
  - `visibility` (string, optional) - `public`, `members`, `council`, `admin`
  - `sort` (string, optional) - `created_at`, `updated_at`, `views`, `relevance`
- **Response (200):**
```typescript
{
  success: true;
  data: Array<{
    id: string;
    title: string;
    slug: string;
    category: string;
    tags: string[];
    excerpt: string;
    visibility: "public" | "members" | "council" | "admin";
    author: { id: string; name: string; avatar_url: string | null };
    views: number;
    created_at: string;
    updated_at: string;
  }>;
  meta: {
    page: number;
    limit: number;
    total: number;
    timestamp: string;
  };
}
```

#### `GET /api/knowledge/:id`
Get a single knowledge item.

- **Auth:** Based on item visibility
- **Params:** `id` (string)
- **Response (200):**
```typescript
{
  success: true;
  data: {
    id: string;
    title: string;
    slug: string;
    content: string;                 // Markdown content
    category: string;
    tags: string[];
    visibility: string;
    author: { id: string; name: string; avatar_url: string | null };
    attachments: Array<{ id: string; filename: string; url: string; mime_type: string }>;
    related_items: Array<{ id: string; title: string }>;
    views: number;
    version: number;
    created_at: string;
    updated_at: string;
  };
}
```

#### `POST /api/knowledge`
Create a new knowledge item.

- **Auth:** `admin` / `founder`
- **Request Body:**
```typescript
{
  title: string;                     // required
  content: string;                   // required, Markdown
  category: "governance" | "legal" | "technical" | "faq" | "tutorial" | "policy";  // required
  tags?: string[];
  visibility?: "public" | "members" | "council" | "admin";  // default "members"
  attachments?: Array<{ filename: string; url: string; mime_type: string }>;
}
```
- **Response (201):**
```typescript
{
  success: true;
  data: KnowledgeItem;
  meta: { timestamp: string };
}
```

#### `PUT /api/knowledge/:id`
Update a knowledge item (creates new version).

- **Auth:** `admin` / `founder`
- **Params:** `id` (string)
- **Request Body:** Same fields as POST (all optional)
- **Response (200):** `{ success: true, data: KnowledgeItem }`

#### `DELETE /api/knowledge/:id`
Archive a knowledge item (soft delete).

- **Auth:** `admin`
- **Params:** `id` (string)
- **Response (200):** `{ success: true, data: { id: string, archived: true } }`

#### `GET /api/knowledge/search`
Full-text search across knowledge base.

- **Auth:** `member`
- **Query Params:**
  - `q` (string, required) - search query
  - `category` (optional)
  - `limit` (number, default 20)
- **Response (200):**
```typescript
{
  success: true;
  data: Array<{
    id: string;
    title: string;
    excerpt: string;
    category: string;
    relevance_score: number;
    highlights: string[];            // matching text snippets
  }>;
  meta: { query: string; total: number; timestamp: string };
}
```

#### `GET /api/knowledge/:id/versions`
Get version history for a knowledge item.

- **Auth:** `admin`
- **Params:** `id` (string)
- **Response (200):**
```typescript
{
  success: true;
  data: Array<{
    version: number;
    changed_by: string;
    changed_at: string;
    change_summary: string;
  }>;
}
```

---

### 5.3 Modules

**Base Path:** `/api/modules`

> AI module management for the DAO's intelligent systems.

#### `GET /api/modules`
List all AI modules and their status.

- **Auth:** `admin`
- **Response (200):**
```typescript
{
  success: true;
  data: Array<{
    id: string;
    name: string;                    // e.g., "mentor", "brain", "legal-gen", "treasury-analyzer"
    description: string;
    status: "active" | "idle" | "error" | "disabled";
    version: string;
    provider: "gemini" | "claude" | "openai" | "custom";
    model: string;                   // e.g., "gemini-1.5-flash"
    last_active: string | null;
    request_count_24h: number;
    error_count_24h: number;
    avg_response_time_ms: number;
    config: {
      max_tokens: number;
      temperature: number;
      rate_limit_rpm: number;
    };
  }>;
  meta: { timestamp: string };
}
```

#### `GET /api/modules/:id`
Get detailed info for a specific module.

- **Auth:** `admin`
- **Params:** `id` (string)
- **Response (200):**
```typescript
{
  success: true;
  data: {
    ...Module;
    recent_requests: Array<{
      id: string;
      prompt_preview: string;
      response_time_ms: number;
      status: "success" | "error";
      timestamp: string;
    }>;
    usage_stats: {
      total_requests: number;
      total_tokens_used: number;
      estimated_cost_usd: number;
      requests_by_day: Array<{ date: string; count: number }>;
    };
  };
}
```

#### `PUT /api/modules/:id`
Update module configuration.

- **Auth:** `admin`
- **Params:** `id` (string)
- **Request Body:**
```typescript
{
  status?: "active" | "disabled";
  config?: {
    max_tokens?: number;
    temperature?: number;
    rate_limit_rpm?: number;
    system_prompt?: string;
  };
}
```
- **Response (200):** `{ success: true, data: Module }`

#### `POST /api/modules/:id/message`
Send a message to a specific AI module.

- **Auth:** `member`
- **Params:** `id` (string) - module ID
- **Request Body:**
```typescript
{
  message: string;                   // required
  context?: {
    dao_id?: number;
    user_id?: string;
    session_id?: string;
    metadata?: object;
  };
}
```
- **Response (200):**
```typescript
{
  success: true;
  data: {
    response: string;
    module_id: string;
    model_used: string;
    tokens_used: { prompt: number; completion: number; total: number };
    response_time_ms: number;
    session_id: string;
  };
  meta: { timestamp: string };
}
```
- **Errors:**
  - 400: Missing message
  - 404: Module not found
  - 503: Module disabled or errored

#### `GET /api/modules/:id/health`
Get module health check.

- **Auth:** `admin`
- **Params:** `id` (string)
- **Response (200):**
```typescript
{
  success: true;
  data: {
    module_id: string;
    status: string;
    latency_ms: number;
    last_error: string | null;
    uptime_percentage_30d: number;
  };
}
```

---

### 5.4 Events

**Base Path:** `/api/events`

> Server-Sent Events (SSE) for real-time updates. Also provides REST endpoints for event history.

#### `GET /api/events/subscribe`
Subscribe to real-time DAO events via SSE.

- **Auth:** `member`
- **Query Params:**
  - `channels` (string, optional) - comma-separated: `treasury`, `governance`, `agreements`, `milestones`, `marketplace`, `system`
  - `dao_id` (number, optional)
- **Response:** SSE stream (`text/event-stream`)
```
event: treasury.transaction.created
data: {"id":"tx_123","type":"treasury.transaction.created","payload":{"amount":500,"recipient":"addr_xyz"},"timestamp":"2026-02-12T10:30:00.000Z"}

event: governance.proposal.voted
data: {"id":"evt_456","type":"governance.proposal.voted","payload":{"proposal_id":"prop_1","voter":"addr_abc","vote":"for"},"timestamp":"2026-02-12T10:31:00.000Z"}

event: heartbeat
data: {"timestamp":"2026-02-12T10:32:00.000Z"}
```

Event types:
| Channel | Events |
|---------|--------|
| `treasury` | `treasury.transaction.created`, `treasury.transaction.approved`, `treasury.transaction.executed`, `treasury.deposit.received` |
| `governance` | `governance.proposal.created`, `governance.proposal.voted`, `governance.proposal.finalized` |
| `agreements` | `agreement.created`, `agreement.signed`, `agreement.activated`, `agreement.status_changed` |
| `milestones` | `milestone.created`, `milestone.completed`, `milestone.overdue` |
| `marketplace` | `marketplace.item.listed`, `marketplace.item.purchased`, `marketplace.item.sold_out` |
| `system` | `system.health.degraded`, `system.maintenance.scheduled`, `system.backup.completed` |

#### `GET /api/events/history`
Get past events (REST, paginated).

- **Auth:** `member`
- **Query Params:**
  - `page` (number, default 1)
  - `limit` (number, default 50, max 200)
  - `channel` (string, optional)
  - `type` (string, optional) - specific event type
  - `since` (string, optional) - ISO date, events after this time
  - `dao_id` (number, optional)
- **Response (200):**
```typescript
{
  success: true;
  data: Array<{
    id: string;
    type: string;
    channel: string;
    payload: object;
    actor: { id: string; type: "user" | "system" };
    dao_id: number | null;
    timestamp: string;
  }>;
  meta: {
    page: number;
    limit: number;
    total: number;
    timestamp: string;
  };
}
```

#### `POST /api/events/emit`
Emit a custom event (admin/system only).

- **Auth:** `admin`
- **Request Body:**
```typescript
{
  type: string;                      // required, e.g., "system.announcement"
  channel: string;                   // required
  payload: object;                   // required
  dao_id?: number;
}
```
- **Response (201):**
```typescript
{
  success: true;
  data: {
    event_id: string;
    type: string;
    delivered_to: number;            // count of active subscribers
  };
}
```

---

### 5.5 Unified Agreements

**Base Path:** `/api/agreements/unified`

> Provides a single interface to query and manage agreements across all types (founder, advisor, contributor, firstborn).

#### `GET /api/agreements/unified`
List all agreements across types with unified format.

- **Auth:** `member`
- **Query Params:**
  - `page` (number, default 1)
  - `limit` (number, default 50)
  - `dao_id` (number, optional)
  - `type` (string, optional) - `founder`, `advisor`, `contributor`, `firstborn`
  - `status` (string, optional) - `draft`, `pending`, `signed`, `active`, `completed`, `cancelled`
  - `search` (string, optional) - search by member name/email
  - `sort` (string, optional) - `created_at`, `status`, `token_allocation`
- **Response (200):**
```typescript
{
  success: true;
  data: Array<{
    agreement_id: number;
    member_id: number;
    type: "founder" | "advisor" | "contributor" | "firstborn";
    title: string;
    member: {
      name: string;
      surname: string;
      email: string;
      wallet_address: string;
      photo_url: string | null;
    };
    status: string;
    token_allocation_total: number;
    milestones_completed: number;
    milestones_total: number;
    contract_status: "none" | "generated" | "approved";
    signature_status: {
      dao_signed: boolean;
      member_signed: boolean;
    };
    created_at: string;
    updated_at: string;
  }>;
  meta: {
    page: number;
    limit: number;
    total: number;
    timestamp: string;
  };
}
```

#### `GET /api/agreements/unified/stats`
Get aggregate agreement statistics.

- **Auth:** `admin`
- **Query Params:** `dao_id` (optional)
- **Response (200):**
```typescript
{
  success: true;
  data: {
    total_agreements: number;
    by_type: {
      founder: { total: number; active: number; draft: number; cancelled: number };
      advisor: { total: number; active: number; draft: number; cancelled: number };
      contributor: { total: number; active: number; draft: number; cancelled: number };
      firstborn: { total: number; active: number; draft: number; cancelled: number };
    };
    by_status: Record<string, number>;
    tokens: {
      total_allocated: number;
      total_released: number;
      total_pending: number;
    };
    milestones: {
      total: number;
      completed: number;
      overdue: number;
    };
  };
  meta: { timestamp: string };
}
```

#### `GET /api/agreements/unified/:id/timeline`
Get full timeline for any agreement type.

- **Auth:** `member`
- **Params:** `id` (number) - Agreement ID
- **Response (200):**
```typescript
{
  success: true;
  data: {
    agreement_id: number;
    type: string;
    events: Array<{
      event_type: "created" | "status_changed" | "contract_generated" | "contract_approved" | "signed" | "milestone_completed" | "token_released" | "deliverable_submitted" | "deliverable_verified";
      timestamp: string;
      actor: string;
      details: object;
    }>;
  };
}
```

#### `POST /api/agreements/unified/bulk-status`
Bulk update agreement statuses.

- **Auth:** `admin`
- **Request Body:**
```typescript
{
  agreement_ids: number[];           // required
  status: string;                    // required
  reason: string;                    // required
  changed_by: string;                // required
}
```
- **Response (200):**
```typescript
{
  success: true;
  data: {
    updated: number;
    failed: Array<{ id: number; error: string }>;
  };
}
```

---

## 6. Foundation Types Reference

These TypeScript types define the canonical data shapes used across the API.

```typescript
// ============================================
// CORE ENTITIES
// ============================================

interface User {
  id: string;
  firebase_uid: string;
  email: string;
  display_name: string;
  wallet_address: string | null;
  avatar_url: string | null;
  bio: string | null;
  role: "member" | "council" | "founder" | "admin";
  bubble_score: number;
  soda_balance: number;
  onboarding_completed: boolean;
  status: "active" | "suspended" | "deactivated";
  preferences: object | null;
  created_at: string;
  updated_at: string;
}

interface DAO {
  id: number;
  daoName: string;
  description: string;
  logo: string | null;
  founder_name: string;
  founder_surname: string;
  founder_cellphone: string | null;
  totalSupply: number;
  walletAddress: string;
  economyType: string;
  // Growth distribution
  founders_growth: number;
  operational: number;
  scale_community: number;
  // Tokenomics (council distribution percentages)
  founders: number;           // 40%
  advisors: number;           // 15%
  foundation: number;         // 15%
  firstBorns: number;         // 10%
  // Legal
  country: string;
  generatedContract: string | null;
}

interface CouncilMember {
  id: number;
  dao_id: number;
  agreement_id: number | null;
  name: string;
  surname: string;
  email: string;
  phone: string | null;
  wallet_address: string;
  photo_url: string | null;
  role_type: "founder" | "advisor" | "contributor" | "firstborn";
  role_category: string | null;
  custom_role_description: string | null;
  token_allocation_total: number;
  firestarter_period_months: number | null;
  term_months: number | null;
  status: "draft" | "pending" | "pending_signature" | "signed" | "active" | "completed" | "cancelled";
  sodaworld_user_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  activated_at: string | null;
  completed_at: string | null;
}

interface Agreement {
  id: string | number;
  dao_id: number;
  title: string;
  description: string;
  type: "Founder Agreement" | "Advisor Agreement" | "Contributor Agreement" | "First Born Agreement";
  status: "Draft" | "Pending" | "Signed" | "Active" | "Completed" | "Cancelled" | "Fully Executed";
  party: string;              // JSON: { name, surname, email, walletAddress }
  details: string;            // JSON: type-specific details
  required_parties: string | null;  // JSON array of addresses
  required_signatures: number | null;
  fully_executed_at: string | null;
  dao_signed_at: string | null;
  dao_signer_address: string | null;
  member_signed_at: string | null;
  member_signer_address: string | null;
  activated_at: string | null;
  created_at: string;
  updated_at: string;
}

interface Milestone {
  id: number;
  agreement_id: number;
  council_member_id: number;
  title: string;
  description: string | null;
  milestone_order: number;
  target_date: string | null;
  token_amount: number | null;
  status: "pending" | "in_progress" | "completed";
  completed_date: string | null;
  verified_by: string | null;
  completion_notes: string | null;
  created_at: string;
  updated_at: string;
}

interface GeneratedContract {
  id: number;
  agreement_id: number;
  council_member_id: number;
  contract_text: string;
  contract_version: number;
  generation_params: string;   // JSON
  legal_framework: string;
  agreement_type: "founder" | "advisor" | "contributor" | "firstborn";
  status: "generated" | "approved" | "failed";
  error_message: string | null;
  generated_at: string;
  generated_by: string;
  approved_by: string | null;
  approved_at: string | null;
}

interface ContributorDeliverable {
  id: number;
  contributor_id: number;
  agreement_id: number;
  milestone_id: number | null;
  contribution_type: "time" | "materials" | "services";
  description: string;
  delivery_window: string | null;
  already_started: boolean;
  progress_description: string | null;
  completion_percentage: number;     // 0-100
  status: "pending" | "in_progress" | "delivered" | "verified" | "rejected";
  actual_delivery_date: string | null;
  verified_by: string | null;
  verification_notes: string | null;
  created_at: string;
  updated_at: string;
}

interface BonusMilestone {
  id: number;
  council_member_id: number;
  agreement_id: number;
  trigger_condition: string;
  description: string;
  token_amount: number;
  status: "active" | "triggered" | "expired";
  triggered_date: string | null;
  verified_by: string | null;
  verification_notes: string | null;
  created_at: string;
  updated_at: string;
}

interface AdvisorEngagement {
  id: number;
  advisor_id: number;
  agreement_id: number;
  engagement_type: "check_in" | "heads_up" | "high_value_intro" | "strategic_review" | "talent_scouting" | "other";
  date: string;
  description: string;
  value_delivered: string | null;
  verified: boolean;
  created_at: string;
}

interface VestingEntry {
  id: number;
  council_member_id: number;
  agreement_id: number;
  milestone_id: number | null;
  release_date: string;
  token_amount: number;
  release_type: "cliff" | "vesting" | "milestone_based";
  status: "scheduled" | "unlocked" | "released";
  released_at: string | null;
  released_by: string | null;
  transaction_hash: string | null;
  created_at: string;
  updated_at: string;
}

interface TreasuryTransaction {
  id: string;
  recipient: string;
  recipientName: string;
  amount: number;
  memo: string;
  status: "Pending" | "Executed" | "Rejected";
  dateInitiated: string;
  dateExecuted: string | null;
  approvals: string[];
}

interface TokenTransaction {
  id: string;
  from_user: string;
  to_user: string;
  amount: number;
  transaction_type: "transfer" | "reward" | "marketplace_purchase" | "vesting_claim";
  reference_id: string | null;
  memo: string;
  status: "completed" | "pending" | "failed";
  created_at: string;
}

interface MarketplaceItem {
  id: string;
  name: string;
  type: "NFT" | "Ticket" | "Merch";
  price: number;
  imageUrl: string | null;
  description: string | null;
  category: string | null;
  creator: { name: string; avatarUrl: string | null };
  edition?: { current: number; total: number };
  status: "active" | "sold_out";
  quantity: number;
  soldCount: number;
}

interface Proposal {
  id: string;
  title: string;
  description: string;
  proposer: { name: string; avatarUrl: string };
  status: "Active" | "Passed" | "Failed" | "Rejected" | "Queued";
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  endDate: string;
  quorum: number;
  finalizedAt: string | null;
}

interface KnowledgeItem {
  id: string;
  title: string;
  slug: string;
  content: string;
  category: "governance" | "legal" | "technical" | "faq" | "tutorial" | "policy";
  tags: string[];
  visibility: "public" | "members" | "council" | "admin";
  author_id: string;
  attachments: object[];
  views: number;
  version: number;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

interface AIModule {
  id: string;
  name: string;
  description: string;
  status: "active" | "idle" | "error" | "disabled";
  version: string;
  provider: "gemini" | "claude" | "openai" | "custom";
  model: string;
  config: object;
  last_active: string | null;
  created_at: string;
  updated_at: string;
}

interface DAOEvent {
  id: string;
  type: string;
  channel: string;
  payload: object;
  actor_id: string | null;
  actor_type: "user" | "system";
  dao_id: number | null;
  timestamp: string;
}
```

---

## 7. Rate Limiting

| Scope | Limit | Window |
|-------|-------|--------|
| General API (`/api/*`) | 100 requests | 15 minutes (per IP) |
| Admin API (`/api/admin/*`) | 20 requests | 15 minutes (per IP) |
| AI Endpoints (`/api/mentor/chat`, `/api/gemini/generate`, `/api/modules/*/message`) | 10 requests | 1 minute (per user) |
| Token Operations (`/api/tokens/transfer`, `/api/token-distribution/*/claim`) | 5 requests | 1 minute (per user) |
| Marketplace Purchase | 3 requests | 1 minute (per user) |

Rate limit headers returned on all responses:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 97
X-RateLimit-Reset: 1707734400
```

Rate limit exceeded response (429):
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again later.",
    "details": {
      "retryAfter": 45
    }
  }
}
```

---

## 8. WebSocket Events

For real-time features beyond SSE, the platform supports WebSocket connections at `ws://<host>/ws`.

### Connection
```javascript
const ws = new WebSocket('ws://localhost:5003/ws');
ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'subscribe',
    channels: ['treasury', 'governance'],
    token: '<firebase_jwt>'
  }));
};
```

### Message Format
```typescript
interface WSMessage {
  type: "subscribe" | "unsubscribe" | "event" | "ping" | "pong";
  channels?: string[];
  token?: string;
  event?: {
    id: string;
    type: string;
    channel: string;
    payload: object;
    timestamp: string;
  };
}
```

### Supported Channels
- `treasury` - Treasury balance changes, transaction updates
- `governance` - New proposals, votes, finalizations
- `agreements` - Agreement status changes, signatures
- `milestones` - Milestone completions, token releases
- `marketplace` - New listings, purchases
- `system` - Health alerts, maintenance notices

---

## Appendix: Token Pool Allocation

| Pool | Percentage | Description |
|------|-----------|-------------|
| Founders | 40% | Distributed among max 7 founders with firestarter vesting |
| Advisors | 15% | Three-part structure: starting grant + milestones + bonus |
| Foundation | 15% | Reserved for DAO operations and community |
| Contributors | 20% | Immediate grant + milestone-based delivery |
| First Borns | 10% | Early investor pool with cliff + linear vesting |

---

*This specification was generated by Machine #1 Hub for the SodaWorld DAO Platform (DAOV1). All endpoints are implemented against Express.js with SQLite (via Knex.js) and Firebase Authentication. Solana wallet integration uses Ed25519 signature verification. AI contract generation uses Google Gemini (gemini-pro / gemini-1.5-flash).*
