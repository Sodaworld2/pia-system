# SodaWorld DAO — AI Mentor Systems & Knowledge Base Architecture Research

**Date:** February 15, 2026 | **Sources:** 85+ references

---

## Executive Summary

SodaWorld's AI mentor system already has a strong foundation: 9 specialized modules (Coach, Legal, Treasury Adviser, Governance, Tokenomics, Community, Technical, Marketplace, Compliance), a 4-tier cost-optimized model waterfall (Ollama/local, Gemini Flash, GPT-4o, Claude), a knowledge base backed by SQLite with 25+ items, RAG-style context injection, and per-module persona routing. This research explores the state of the art across 10 critical domains — from RAG architecture and vector search to multi-agent orchestration and AI safety — and maps each to concrete, phased improvements for SodaWorld.

The central recommendation is a three-phase upgrade path:

- **Phase 1 (Immediate):** Add `sqlite-vec` for vector search alongside the existing SQLite knowledge base, implement semantic chunking and hybrid BM25+vector retrieval, deploy embedding generation via Ollama's `nomic-embed-text`, and add output guardrails to all 9 modules.
- **Phase 2 (Near-term):** Build MCP servers for each DAO module, introduce LangGraph-style orchestration for multi-module queries, add a knowledge graph layer for entity relationships, and implement document processing for legal/governance PDFs.
- **Phase 3 (Strategic):** Evaluate fine-tuning LoRA adapters for the Coach and Legal personas, deploy GraphRAG for global DAO sensemaking, migrate to Chroma or pgvector if scale demands it, and build a full agentic RAG pipeline with three-layer guardrails.

---

## 1. RAG Architecture — Retrieval-Augmented Generation

### 1.1 Current State of the Art (2025-2026)

RAG has matured from an experimental technique into the **production standard for enterprise AI** systems. The 2025-2026 landscape features several generations of RAG:

| Generation | Description | Example |
|-----------|-------------|---------|
| **Naive RAG** | Simple embed-retrieve-generate | SodaWorld's current approach |
| **Advanced RAG** | Hybrid search, re-ranking, query expansion | Production standard |
| **Modular RAG** | Pluggable retrieval/generation modules | LlamaIndex pipelines |
| **Agentic RAG** | Agents decide when/how to retrieve | LangGraph + tool use |
| **GraphRAG** | Knowledge graph + community summaries | Microsoft GraphRAG |

Key advancements:
- **Contextual RAG** (Anthropic, 2024): Prepend a short contextual summary to each chunk before embedding, improving retrieval accuracy by 49% over naive chunking.
- **Long RAG**: Processing longer retrieval units (sections or entire documents) rather than small chunks, preserving context and reducing fragmentation.
- **Agentic RAG**: Agents dynamically decide whether retrieval is needed, which sources to query, and whether to iterate, making RAG adaptive rather than static.

### 1.2 Chunking Strategies

| Strategy | Chunk Size | Best For | Recall | Compute Cost |
|----------|-----------|----------|--------|-------------|
| Fixed-size (RecursiveCharacter) | 400-512 tokens | General purpose | 85-90% | Low |
| Semantic chunking | Variable | Documents with mixed topics | +15-25% vs fixed | 3-5x higher |
| Heading-aware | Section-based | Structured docs (legal, governance) | High | Low |
| LLM-based chunking | Variable | High-value complex docs | Highest | Very high |
| Page-level | Full pages | PDFs, presentations | 0.648 accuracy (NVIDIA benchmark) | Medium |

**Optimal chunk parameters for SodaWorld:**
- **Default:** 400-800 tokens with 20% overlap (80-160 tokens)
- **Legal documents:** 800-1500 tokens (preserve clause context)
- **FAQ/knowledge items:** 200-400 tokens (precise retrieval)
- **Governance proposals:** Section-level chunking by heading

### 1.3 Hybrid Search (BM25 + Vector)

Hybrid search is no longer experimental — it is the **production standard** for enterprise RAG in 2025. It combines:

- **BM25 (sparse/keyword):** Excels at exact term matching, abbreviations, proper nouns, and DAO-specific terminology like "SODA token", "quadratic voting", or specific proposal IDs.
- **Vector (dense/semantic):** Captures meaning and handles paraphrasing, typos, and conceptual queries like "how do we handle treasury diversification?"

**Fusion methods:**
- **Reciprocal Rank Fusion (RRF):** Assigns scores based on rank position from both searches. Simple, fast, no hyperparameters. Score = 1/(k + rank), typically k=60.
- **Relative Score Fusion:** Normalizes and merges raw scores. Better when score distributions differ significantly.
- **Weighted combination:** alpha * vector_score + (1-alpha) * bm25_score, with alpha typically 0.5-0.7.

### 1.4 Re-Ranking

Re-ranking applies a **cross-encoder** model after initial retrieval to re-score documents by true relevance to the query:

- **Cross-encoder models:** bge-reranker-v2-m3, Cohere Rerank, ColBERT — 15-82% improvement in accuracy.
- **RRF-based re-ranking:** Faster (near-zero resource cost) but may decrease performance on some datasets.
- **Recommendation:** Use RRF for Phase 1, cross-encoder re-ranking for Phase 2.

### 1.5 Context Window Optimization

With modern LLMs supporting 128K-200K+ context windows, the challenge shifts from fitting context to **optimizing signal-to-noise ratio**:

- Retrieve top-k chunks (k=5-10), but re-rank and trim to top-3 for generation
- Place most relevant context at the beginning and end of the prompt ("lost in the middle" effect)
- Include metadata headers: `[Source: Legal Module | Category: compliance | Confidence: 0.95]`

### 1.6 SodaWorld Application

SodaWorld's current `getRelevantKnowledge()` in `base-module.ts` retrieves by `dao_id` + `module_id`, ordered by confidence and recency — a naive approach that misses semantic relevance entirely. The `_query` parameter is accepted but unused.

**Recommended upgrade path:**

```typescript
// Phase 1: Add hybrid search to BaseModule
protected async getRelevantKnowledge(
  daoId: string,
  query: string,
  limit = 10,
): Promise<KnowledgeItem[]> {
  // 1. BM25 keyword search via SQLite FTS5
  const keywordResults = await this.db.raw(`
    SELECT ki.*, rank
    FROM knowledge_items_fts fts
    JOIN knowledge_items ki ON ki.id = fts.rowid
    WHERE knowledge_items_fts MATCH ?
      AND ki.dao_id = ? AND ki.module_id = ?
    ORDER BY rank
    LIMIT ?
  `, [query, daoId, this.moduleId, limit * 2]);

  // 2. Vector similarity search via sqlite-vec
  const queryEmbedding = await this.getEmbedding(query);
  const vectorResults = await this.db.raw(`
    SELECT ki.*, vec_distance_cosine(ki.embedding_vector, ?) as distance
    FROM knowledge_items ki
    WHERE ki.dao_id = ? AND ki.module_id = ?
      AND ki.embedding_vector IS NOT NULL
    ORDER BY distance ASC
    LIMIT ?
  `, [queryEmbedding, daoId, this.moduleId, limit * 2]);

  // 3. RRF fusion
  return this.reciprocalRankFusion(keywordResults, vectorResults, limit);
}

private reciprocalRankFusion(
  keywordResults: KnowledgeItem[],
  vectorResults: KnowledgeItem[],
  limit: number,
  k = 60,
): KnowledgeItem[] {
  const scores = new Map<string, { item: KnowledgeItem; score: number }>();

  keywordResults.forEach((item, rank) => {
    const existing = scores.get(item.id);
    const rrfScore = 1 / (k + rank + 1);
    scores.set(item.id, {
      item,
      score: (existing?.score ?? 0) + rrfScore,
    });
  });

  vectorResults.forEach((item, rank) => {
    const existing = scores.get(item.id);
    const rrfScore = 1 / (k + rank + 1);
    scores.set(item.id, {
      item: existing?.item ?? item,
      score: (existing?.score ?? 0) + rrfScore,
    });
  });

  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.item);
}
```

---

## 2. Vector Databases — Comparison for DAO Use Cases

### 2.1 Landscape Overview (2025-2026)

| Database | Type | Best For | Scale | Hybrid Search | Price |
|----------|------|----------|-------|--------------|-------|
| **sqlite-vec** | Embedded | Local-first, small-medium datasets | <1M vectors | Manual (BM25 separate) | Free/OSS |
| **Chroma** | Embedded/Server | Prototyping, small apps | <10M vectors | Built-in | Free/OSS |
| **pgvector** | PostgreSQL extension | Mixed relational+vector | <50M vectors | Via pg_trgm + pgvector | Free/OSS |
| **Weaviate** | Standalone server | Production hybrid search | Billions | Native BM25+vector | OSS + Cloud |
| **Pinecone** | Managed cloud | Zero-ops production | Billions | Sparse+dense | $0.096/hr+ |
| **Milvus** | Distributed | Enterprise-scale | Billions | Multiple index types | OSS + Cloud |
| **Qdrant** | Standalone server | High-performance production | Billions | Native | OSS + Cloud |

### 2.2 sqlite-vec — Best Fit for SodaWorld Phase 1

Given SodaWorld's existing SQLite-based architecture, **sqlite-vec** is the ideal Phase 1 choice:

- **Zero dependencies:** Written in pure C, runs anywhere SQLite runs (including WASM)
- **Successor to sqlite-vss:** Actively maintained, much easier to install than the deprecated sqlite-vss
- **KNN search:** SIMD-accelerated vector similarity (cosine, L2, inner product)
- **Storage:** Vectors stored directly in SQLite tables as JSON or raw bytes
- **Scale:** Adequate for SodaWorld's current 25+ knowledge items, scales to tens of thousands

```typescript
// sqlite-vec integration example
import Database from 'better-sqlite3';

// Load the extension
const db = new Database('dao.sqlite');
db.loadExtension('vec0');

// Create a virtual table for vector search
db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_embeddings USING vec0(
    item_id TEXT PRIMARY KEY,
    embedding FLOAT[1024]  -- nomic-embed-text dimension
  );
`);

// Insert embedding
const stmt = db.prepare(`
  INSERT INTO knowledge_embeddings (item_id, embedding)
  VALUES (?, ?)
`);
stmt.run(itemId, JSON.stringify(embedding));

// Query nearest neighbors
const results = db.prepare(`
  SELECT item_id, distance
  FROM knowledge_embeddings
  WHERE embedding MATCH ?
  ORDER BY distance
  LIMIT ?
`).all(JSON.stringify(queryEmbedding), 10);
```

### 2.3 Chroma — Best Fit for Phase 2

If SodaWorld outgrows sqlite-vec or needs more advanced features:

- **Python-native API** (also has JS client): Feels like NumPy, not a database
- **2025 Rust rewrite:** 4x faster writes and queries
- **Built-in embedding functions:** Can auto-embed documents
- **Metadata filtering:** Filter by module_id, category, dao_id alongside vector search
- **Persistence:** Automatic disk persistence, ACID-compliant via SQLite backend
- **Scale:** Ideal for up to 10M vectors, which covers SodaWorld's foreseeable growth

### 2.4 pgvector — Alternative for Unified Stack

If SodaWorld migrates from SQLite to PostgreSQL in the future:

- **Single database for everything:** Relational data + vectors + full-text search
- **HNSW and IVFFlat indexes:** Good query performance up to 50M vectors
- **Hybrid search:** Combine `pg_trgm` (trigram similarity) or `tsvector` (full-text) with vector distance
- **Caveat:** Vector indexes can consume significant memory; not ideal for very large scale

### 2.5 SodaWorld Recommendation

**Phase 1:** sqlite-vec (embedded, zero infrastructure change)
**Phase 2:** Chroma (if more advanced features needed) or pgvector (if migrating to PostgreSQL)
**Phase 3:** Weaviate or Qdrant (if scaling to multi-tenant SaaS with billions of vectors)

---

## 3. MCP (Model Context Protocol)

### 3.1 Current State (2025-2026)

MCP has evolved from Anthropic's internal experiment (November 2024) into an **industry standard** for connecting AI models to external tools and data. Key milestones:

- **10,000+ active public MCP servers** as of late 2025
- **Adopted by:** ChatGPT, Cursor, Gemini, Microsoft Copilot, VS Code
- **Donated to Linux Foundation:** In December 2025, Anthropic donated MCP to the Agentic AI Foundation (AAIF), co-founded with Block and OpenAI
- **Specification:** The latest spec (2025-11-25) supports tools, resources, prompts, and tool annotations

### 3.2 MCP Architecture

MCP uses a client-server architecture:

```
┌────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  AI Model      │     │  MCP Client      │     │  MCP Server      │
│  (Claude, etc) │────▶│  (Host app)      │────▶│  (Your tools)    │
└────────────────┘     └──────────────────┘     └──────────────────┘
                              │                        │
                              │     stdio / HTTP       │
                              │◀──────────────────────▶│
                                                       │
                                              ┌────────┴────────┐
                                              │                 │
                                         Resources          Tools
                                         (read data)        (execute)
                                              │                 │
                                         Prompts           Sampling
                                         (templates)       (LLM calls)
```

**Three core primitives:**
1. **Resources** — File-like data that clients can read (knowledge base items, DAO configurations, proposal texts)
2. **Tools** — Functions the LLM can call with user approval (create proposal, query treasury, run compliance check)
3. **Prompts** — Pre-written templates for common tasks (SWOT analysis, legal review, OKR generation)

### 3.3 Building MCP Servers for SodaWorld

Each of the 9 DAO AI modules maps naturally to an MCP server:

```typescript
// Example: Coach MCP Server
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new McpServer({
  name: 'sodaworld-coach',
  version: '1.0.0',
});

// Resource: Get coaching knowledge for a DAO
server.resource(
  'coaching-knowledge',
  'dao://{daoId}/coach/knowledge',
  async (uri) => {
    const daoId = uri.pathname.split('/')[1];
    const knowledge = await coachModule.getKnowledge(daoId);
    return {
      contents: [{
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify(knowledge, null, 2),
      }],
    };
  }
);

// Tool: Generate OKRs
server.tool(
  'generate-okrs',
  {
    description: 'Generate OKRs for a DAO based on its goals and strategy',
    inputSchema: {
      type: 'object',
      properties: {
        daoId: { type: 'string', description: 'The DAO identifier' },
        quarter: { type: 'string', description: 'Target quarter (e.g., Q1-2026)' },
        focusAreas: { type: 'array', items: { type: 'string' } },
      },
      required: ['daoId', 'quarter'],
    },
  },
  async ({ daoId, quarter, focusAreas }) => {
    const result = await coachModule.generateOKRs(daoId, 'mcp-user', {
      quarter,
      focus_areas: focusAreas ?? [],
    });
    return { content: [{ type: 'text', text: result.content }] };
  }
);

// Prompt: SWOT analysis template
server.prompt(
  'swot-analysis',
  {
    description: 'Run a SWOT analysis for a DAO',
    arguments: [
      { name: 'daoId', description: 'DAO identifier', required: true },
    ],
  },
  async ({ daoId }) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Perform a comprehensive SWOT analysis for DAO ${daoId}...`,
      },
    }],
  })
);

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
```

### 3.4 MCP Server Mapping for SodaWorld Modules

| Module | Resources | Tools | Prompts |
|--------|-----------|-------|---------|
| **Coach** | Knowledge, OKRs, milestones | generate-okrs, plan-milestones, swot-analysis | coaching-session, goal-setting |
| **Legal** | Agreements, templates, compliance docs | review-agreement, generate-template, compliance-check | legal-review, nda-draft |
| **Treasury** | Balances, transactions, budgets | create-transaction, approve-budget, runway-calc | treasury-report, budget-review |
| **Governance** | Proposals, votes, council members | create-proposal, cast-vote, delegate-power | governance-review, voting-guide |
| **Tokenomics** | Token distribution, vesting, supply | model-distribution, simulate-vesting | tokenomics-analysis |
| **Community** | Members, reputation, activity | invite-member, award-reputation | community-health |
| **Technical** | Architecture, deployments, issues | run-audit, deploy-check | technical-review |
| **Marketplace** | Bounties, listings, transactions | create-bounty, submit-work | marketplace-listing |
| **Compliance** | Regulations, audits, reports | compliance-audit, generate-report | regulatory-check |

### 3.5 Code Execution with MCP

A key 2025 advancement is **code execution via MCP**, which enables agents to:
- Load tools on demand rather than pre-loading all tools into context
- Filter and transform data before it reaches the model
- Execute complex multi-step logic in a single tool call

This maps well to SodaWorld's cost optimization strategy — an MCP server can pre-filter knowledge base results, run budget calculations, or validate governance rules without burning LLM tokens.

---

## 4. Multi-Agent Systems — Orchestrating AI Personas

### 4.1 Framework Comparison (2025-2026)

72% of enterprise AI projects now involve multi-agent architectures, up from 23% in 2024. The three dominant frameworks:

| Framework | Architecture | Strengths | Weaknesses | TypeScript Support |
|-----------|-------------|-----------|------------|-------------------|
| **LangGraph** | Graph-based DAG | Conditional branching, state management, parallel execution | Steeper learning curve | Full (LangGraph.js) |
| **CrewAI** | Role-based teams | Intuitive role assignment, delegation, hierarchical processes | Python-only | None (Python only) |
| **AutoGen/AG2** | Conversation-based | Natural language interaction, dynamic role-playing | Merged with Semantic Kernel (Oct 2025) | Partial |

### 4.2 LangGraph — Recommended for SodaWorld

LangGraph is the best fit for SodaWorld because:
1. **TypeScript support** (LangGraph.js) aligns with the existing codebase
2. **Graph-based architecture** maps naturally to the 9-module routing problem
3. **Conditional edges** enable dynamic module selection based on intent classification
4. **State management** tracks conversation context across module handoffs

```typescript
// LangGraph orchestration for SodaWorld modules
import { StateGraph, END } from '@langchain/langgraph';

interface DAOState {
  query: string;
  classification: Classification;
  activeModules: string[];
  responses: Map<string, AgentResponse>;
  finalResponse: string;
}

const graph = new StateGraph<DAOState>({
  channels: {
    query: { value: (a, b) => b ?? a },
    classification: { value: (a, b) => b ?? a },
    activeModules: { value: (a, b) => b ?? a },
    responses: { value: (a, b) => new Map([...a, ...b]) },
    finalResponse: { value: (a, b) => b ?? a },
  },
});

// Node: Classify and route
graph.addNode('classify', async (state) => {
  const classification = classifyLocally(state.query);
  const modules = routeToModules(classification); // May return multiple
  return { classification, activeModules: modules };
});

// Node: Execute module (one per active module)
graph.addNode('executeModule', async (state) => {
  const responses = new Map<string, AgentResponse>();
  await Promise.all(
    state.activeModules.map(async (moduleId) => {
      const module = getModule(moduleId);
      const response = await module.processMessage({
        content: state.query,
        dao_id: state.classification.daoId,
        user_id: state.classification.userId,
      });
      responses.set(moduleId, response);
    })
  );
  return { responses };
});

// Node: Synthesize responses
graph.addNode('synthesize', async (state) => {
  if (state.responses.size === 1) {
    const [response] = state.responses.values();
    return { finalResponse: response.content };
  }
  // Multi-module: merge and synthesize
  const synthesis = await synthesizeResponses(state.responses, state.query);
  return { finalResponse: synthesis };
});

// Edges
graph.addEdge('classify', 'executeModule');
graph.addEdge('executeModule', 'synthesize');
graph.addEdge('synthesize', END);
graph.setEntryPoint('classify');
```

### 4.3 Multi-Module Query Routing

Some user queries span multiple modules. For example:

| Query | Primary Module | Secondary Modules |
|-------|---------------|-------------------|
| "Should we launch our token next quarter?" | Tokenomics | Coach, Legal, Treasury |
| "Draft an operating agreement" | Legal | Governance, Compliance |
| "How is our treasury doing?" | Treasury | Coach (strategic advice) |
| "What compliance issues should I worry about?" | Compliance | Legal, Governance |

**Implementation:** Use the existing intent classifier to detect multi-module queries, then fan out to relevant modules in parallel, and synthesize with a final LLM call.

### 4.4 CrewAI Concepts Worth Adopting

Even though CrewAI is Python-only, its design principles are valuable:

- **Role-based delegation:** SodaWorld already has this via per-module `systemPrompt` — the key is making inter-module delegation explicit.
- **Hierarchical processes:** A "manager" agent (the AI Router) coordinates, delegates to specialists, and validates results.
- **80/20 rule:** 80% of effort should go into designing tasks (prompts, knowledge retrieval), not agent definitions.

---

## 5. DAO-Specific AI

### 5.1 Aragon — Automated Governance

Aragon is shifting from **constant proposal voting to rule-based automation**:

- **Governance Automation:** Recurring decisions (payroll, treasury rebalancing) execute automatically based on predefined rules — no human vote needed for routine operations.
- **AI-Gated Transactions:** An AI agent can make trades below a certain dollar threshold; trades above the threshold automatically trigger a governance vote.
- **Token Ownership Index:** Verifies which tokens grant actual control rights.

**SodaWorld application:** The Treasury Adviser module should implement spending tiers — small expenditures auto-approved, medium expenditures require AI review + single signer, large expenditures trigger a full governance vote.

### 5.2 DeXe — AI-Powered Governance at Scale

DeXe Protocol data shows the scale of DAO governance: 29,000+ users authored 84,000+ proposals, with 1.7M voters casting 10.4M votes. AI can help by:

- **Proposal summarization:** Condense long proposals into key points
- **Impact analysis:** Predict consequences of proposed changes
- **Voter education:** Explain proposals in plain language
- **Duplicate detection:** Flag proposals similar to previous ones

### 5.3 AI-Powered Treasury Management

Current best practices for AI-assisted treasury management:

```typescript
// Treasury AI Adviser implementation
interface TreasuryAIAdvice {
  action: 'approve' | 'review' | 'reject' | 'escalate';
  confidence: number;
  reasoning: string;
  risk_factors: string[];
  similar_transactions: string[];  // IDs of similar past transactions
}

async function adviseTreasuryAction(
  transaction: TreasuryTransaction,
  daoContext: DAOContext,
): Promise<TreasuryAIAdvice> {
  // 1. Check spending policies
  const policyCheck = await checkSpendingPolicies(transaction, daoContext);

  // 2. Retrieve similar past transactions via RAG
  const similarTxs = await searchContext(
    `${transaction.category} ${transaction.amount} ${transaction.recipient}`,
    5,
  );

  // 3. Risk assessment
  const riskFactors = assessRisk(transaction, daoContext);

  // 4. AI recommendation
  if (transaction.amount <= daoContext.autoApproveThreshold) {
    return { action: 'approve', confidence: 0.95, reasoning: 'Within auto-approve limit', risk_factors: riskFactors, similar_transactions: [] };
  }

  if (riskFactors.length > 2) {
    return { action: 'escalate', confidence: 0.7, reasoning: 'Multiple risk factors detected', risk_factors: riskFactors, similar_transactions: similarTxs.map(t => t.id) };
  }

  return { action: 'review', confidence: 0.8, reasoning: 'Requires human review', risk_factors: riskFactors, similar_transactions: similarTxs.map(t => t.id) };
}
```

### 5.4 Quack AI Governance

An emerging project where AI agents actively participate in DAO governance by analyzing proposals, predicting outcomes, and even casting votes on behalf of delegators — representing the frontier of AI-DAO integration.

### 5.5 SodaWorld Recommendations

1. Implement AI-gated spending tiers in the Treasury module
2. Add proposal summarization to the Governance module
3. Build a compliance checker that runs automatically on all proposals before voting
4. Track all AI recommendations in `ai_conversations` for auditability

---

## 6. Knowledge Graphs — Organizational Memory

### 6.1 Current State (2025-2026)

Knowledge graphs have become the **structural backbone for AI memory systems**, with Neo4j leading the space. Key developments:

- **Context Graphs:** Knowledge graphs specifically designed to capture **decision traces** — the full context, reasoning, and causal relationships behind every significant decision in an organization. This is exactly what a DAO needs for institutional memory.
- **GraphRAG (Microsoft):** Creates a knowledge graph from text, builds community hierarchies, generates summaries, and uses these at query time. Substantial improvements over naive RAG for global sensemaking questions.
- **LLM Graph Builder (Neo4j):** Open-source tool for entity extraction, link extraction, vector chunking, and entity-chunk linking from unstructured text.

### 6.2 GraphRAG Architecture

```
                    ┌──────────────────┐
                    │  Source Documents │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │  Entity/Relation  │
                    │  Extraction (LLM) │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │  Knowledge Graph  │
                    │  (Nodes + Edges)  │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │  Community        │
                    │  Detection        │
                    │  (Leiden algo)    │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────▼───┐  ┌──────▼──────┐  ┌───▼────────┐
     │ Level 0    │  │ Level 1     │  │ Level 2    │
     │ Communities│  │ Communities │  │ Communities│
     │ (detailed) │  │ (moderate)  │  │ (high-level│
     └────────────┘  └─────────────┘  └────────────┘
              │              │              │
              └──────────────┼──────────────┘
                             │
                    ┌────────▼─────────┐
                    │  Community        │
                    │  Summaries (LLM)  │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │  Query Processing │
                    │  (Local + Global) │
                    └──────────────────┘
```

### 6.3 DAO Knowledge Graph Schema

For SodaWorld, the knowledge graph would capture relationships between DAO entities:

```
// Node types
(:DAO {id, name, phase, governance_model})
(:Member {id, name, role, reputation})
(:Proposal {id, title, status, vote_result})
(:Agreement {id, type, status, parties})
(:Token {symbol, supply, distribution})
(:Treasury {balance, runway_months})
(:KnowledgeItem {id, title, category, module})
(:Decision {id, description, outcome, rationale})
(:Milestone {id, title, status, due_date})

// Relationship types
(Member)-[:FOUNDED]->(DAO)
(Member)-[:VOTED_ON {vote: 'for'|'against'|'abstain'}]->(Proposal)
(Member)-[:SIGNED]->(Agreement)
(Member)-[:PROPOSED]->(Proposal)
(Proposal)-[:AFFECTS]->(Treasury)
(Proposal)-[:REFERENCES]->(KnowledgeItem)
(Decision)-[:BASED_ON]->(KnowledgeItem)
(Decision)-[:LED_TO]->(Milestone)
(KnowledgeItem)-[:RELATED_TO]->(KnowledgeItem)
(Agreement)-[:GOVERNS]->(DAO)
```

### 6.4 Lightweight Graph in SQLite

Rather than introducing Neo4j (heavy infrastructure), SodaWorld can implement a lightweight graph layer in SQLite:

```sql
-- Entity-relationship table for knowledge graph
CREATE TABLE knowledge_relations (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  source_type TEXT NOT NULL,  -- 'knowledge_item', 'proposal', 'member', etc.
  relation TEXT NOT NULL,      -- 'related_to', 'depends_on', 'contradicts', etc.
  target_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  confidence REAL DEFAULT 1.0,
  metadata TEXT,               -- JSON
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);

-- Entity extraction from conversations
CREATE TABLE knowledge_entities (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,   -- 'person', 'concept', 'regulation', 'tool'
  name TEXT NOT NULL,
  description TEXT,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  mention_count INTEGER DEFAULT 1,
  dao_id TEXT NOT NULL
);

-- Index for efficient graph traversal
CREATE INDEX idx_relations_source ON knowledge_relations(source_id, source_type);
CREATE INDEX idx_relations_target ON knowledge_relations(target_id, target_type);
CREATE INDEX idx_entities_dao ON knowledge_entities(dao_id, entity_type);
```

### 6.5 SodaWorld Recommendations

1. **Phase 1:** Add `knowledge_relations` and `knowledge_entities` tables to SQLite
2. **Phase 2:** Implement automatic entity extraction from conversations using the LLM (entities mentioned in coach sessions, legal reviews, etc.)
3. **Phase 3:** Evaluate Microsoft GraphRAG for global DAO sensemaking, or Neo4j if the knowledge graph grows beyond what SQLite can efficiently traverse

---

## 7. Fine-Tuning vs RAG

### 7.1 Decision Framework

| Factor | RAG | Fine-Tuning (LoRA) | Both |
|--------|-----|-------------------|------|
| **Data freshness** | Real-time updates | Static (requires retraining) | RAG for dynamic + fine-tune for style |
| **Cost** | Retrieval infra + tokens | Training compute + storage | Higher total cost |
| **Accuracy on domain** | Good (with quality retrieval) | Excellent (domain-native) | Best |
| **Transparency** | High (can cite sources) | Low (baked into weights) | Medium |
| **Setup effort** | Low-Medium | High | Highest |
| **Best for** | Factual Q&A, document search | Behavior/style adaptation | Critical applications |

The canonical advice: **"Fine-tune for behavior, RAG for knowledge."**

### 7.2 When SodaWorld Should Use RAG (Most Cases)

RAG is the right choice for SodaWorld's knowledge base because:
- Knowledge changes frequently (proposals, agreements, treasury state)
- Sources must be cited for auditability
- Multiple modules share the same knowledge base
- Cost is a primary concern (no training compute needed)

### 7.3 When SodaWorld Should Consider Fine-Tuning

LoRA fine-tuning makes sense for two specific SodaWorld use cases:

**1. Coach Persona Adaptation:**
- Train a LoRA adapter on high-quality coaching conversations
- Teaches the model the specific coaching style, framework preferences, and response format
- **Cost:** ~$5-50 to train a LoRA adapter on 1,000 examples using Unsloth or similar
- **Size:** LoRA adapters are typically 10-50MB (vs full model weights at 10-50GB)

**2. Legal Document Style:**
- Train a LoRA adapter on SodaWorld's legal templates and agreement formats
- Produces more consistent, template-compliant legal drafts
- Important: This teaches style, not legal knowledge (knowledge comes from RAG)

```python
# LoRA fine-tuning example using Unsloth (Python)
from unsloth import FastLanguageModel

model, tokenizer = FastLanguageModel.from_pretrained(
    model_name="unsloth/Llama-3.3-70B-Instruct",
    max_seq_length=4096,
    load_in_4bit=True,
)

model = FastLanguageModel.get_peft_model(
    model,
    r=16,              # LoRA rank (higher = more capacity, more compute)
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
    lora_alpha=16,
    lora_dropout=0,
    use_gradient_checkpointing="unsloth",
)

# Training data: coaching conversations
dataset = load_coaching_conversations()  # ~1000 examples

# Train for 3-5 epochs
trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    train_dataset=dataset,
    max_seq_length=4096,
    dataset_num_proc=2,
    args=TrainingArguments(
        per_device_train_batch_size=2,
        gradient_accumulation_steps=4,
        warmup_steps=5,
        max_steps=60,
        learning_rate=2e-4,
        output_dir="coach-lora-adapter",
    ),
)
trainer.train()
model.save_pretrained("coach-lora-adapter")
```

### 7.4 The Hybrid Approach

The recommended strategy for SodaWorld: **RAG for all modules + LoRA adapters for Coach and Legal personas (Phase 3).**

Modern systems combine: Fine-tune for behavior --> Adapters for customization --> RAG for factual grounding.

---

## 8. AI Safety & Alignment

### 8.1 Why This Matters for DAOs

A DAO AI mentor that provides incorrect legal advice, hallucinates financial data, or suggests governance actions with unforeseen consequences could cause real harm. AI safety is not optional — it is a **fiduciary responsibility**.

### 8.2 Three-Layer Guardrail Architecture (2026 Best Practice)

```
┌─────────────────────────────────────────┐
│               INPUT RAILS               │
│  - PII detection & redaction            │
│  - Jailbreak/injection detection        │
│  - Topic boundary enforcement           │
│  - Rate limiting & cost guards          │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│             PROCESS RAILS               │
│  - RAG grounding (retrieve before gen)  │
│  - Module boundary enforcement          │
│  - Source citation requirements         │
│  - Reasoning trace validation           │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│              OUTPUT RAILS               │
│  - Hallucination detection              │
│  - Factual grounding verification       │
│  - Disclaimer injection for legal/fin   │
│  - Confidence thresholds                │
└─────────────────────────────────────────┘
```

### 8.3 Hallucination Detection Strategies

| Strategy | Latency | Accuracy | Implementation |
|----------|---------|----------|---------------|
| **Source grounding check** | Low (~50ms) | Medium | Compare output claims to retrieved chunks |
| **Self-consistency check** | Medium (~2s) | Good | Generate 3 responses, flag disagreements |
| **Cross-model verification** | High (~5s) | High | Verify with a different model |
| **Automated reasoning (AWS)** | Medium (~1s) | Up to 99% | Formal logic verification |
| **NeMo Guardrails** | Low (~100ms) | Good | Rule-based + model-based rails |

**Stanford research confirms:** RAG combined with guardrails reduces hallucinations by **96%** compared to standalone language models.

### 8.4 Implementation for SodaWorld

```typescript
// Output guardrail for DAO AI responses
interface GuardrailResult {
  passed: boolean;
  flags: string[];
  modifications: string[];
  confidence: number;
}

async function applyOutputGuardrails(
  response: string,
  ragSources: KnowledgeItem[],
  moduleId: AIModuleId,
): Promise<GuardrailResult> {
  const flags: string[] = [];
  const modifications: string[] = [];

  // 1. Source grounding check
  if (ragSources.length > 0) {
    const groundedClaims = checkGrounding(response, ragSources);
    if (groundedClaims.ungroundedCount > 0) {
      flags.push(`${groundedClaims.ungroundedCount} claims not supported by sources`);
    }
  }

  // 2. Legal disclaimer injection
  if (moduleId === 'legal' || moduleId === 'compliance') {
    if (!response.includes('not legal advice') && !response.includes('consult a professional')) {
      modifications.push('Added legal disclaimer');
      response += '\n\n*This is AI-generated guidance, not legal advice. Consult a qualified professional for your specific situation.*';
    }
  }

  // 3. Financial disclaimer injection
  if (moduleId === 'treasury' || moduleId === 'tokenomics') {
    if (!response.includes('not financial advice')) {
      modifications.push('Added financial disclaimer');
      response += '\n\n*This is AI-generated analysis, not financial advice. All financial decisions should be reviewed by qualified professionals.*';
    }
  }

  // 4. Confidence threshold
  const confidence = calculateResponseConfidence(response, ragSources);
  if (confidence < 0.3) {
    flags.push('Low confidence response — may need human review');
  }

  // 5. PII detection in output
  const piiPatterns = [
    /\b\d{3}-\d{2}-\d{4}\b/,  // SSN
    /\b(?:\d{4}[\s-]?){3}\d{4}\b/,  // Credit card
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,  // Email
  ];
  for (const pattern of piiPatterns) {
    if (pattern.test(response)) {
      flags.push('Potential PII detected in response');
      break;
    }
  }

  return {
    passed: flags.length === 0,
    flags,
    modifications,
    confidence,
  };
}
```

### 8.5 NVIDIA NeMo Guardrails Integration

NeMo Guardrails provides a declarative way to define safety rails using the Colang language:

```yaml
# config.yml for SodaWorld guardrails
models:
  - type: main
    engine: openai
    model: gpt-4o

rails:
  input:
    flows:
      - check_jailbreak
      - check_topic_allowed

  output:
    flows:
      - check_hallucination
      - add_disclaimer
      - check_pii

  retrieval:
    flows:
      - check_source_relevance
```

### 8.6 SodaWorld-Specific Safety Considerations

| Module | Key Risks | Guardrails Needed |
|--------|-----------|-------------------|
| **Legal** | Incorrect legal advice, jurisdiction errors | Mandatory disclaimers, source citation, human review flag |
| **Treasury** | Wrong financial calculations, unauthorized advice | Amount validation, disclaimer, confidence thresholds |
| **Governance** | Biased voting recommendations | Neutrality check, present all sides, no vote recommendations |
| **Tokenomics** | Securities law violations, price predictions | No price predictions rail, regulatory disclaimers |
| **Compliance** | Outdated regulations, wrong jurisdiction | Date-stamp knowledge, jurisdiction verification |
| **Coach** | Harmful advice, overconfidence | Empathy check, escalation to human coach |
| **Community** | Harassment, discrimination | Content filtering, inclusive language check |
| **Technical** | Insecure code suggestions, wrong architecture | Security review flag, tested-only recommendations |
| **Marketplace** | Scam detection, price manipulation | Transaction verification, reputation checks |

---

## 9. Embedding Models

### 9.1 Comparison Table (2025-2026)

| Model | Provider | Dimensions | Context | MTEB Score | Cost | Local? |
|-------|----------|-----------|---------|-----------|------|--------|
| **text-embedding-3-large** | OpenAI | 3072 | 8191 | 64.6 | $0.13/1M tokens | No |
| **text-embedding-3-small** | OpenAI | 1536 | 8191 | 62.3 | $0.02/1M tokens | No |
| **text-embedding-ada-002** | OpenAI | 1536 | 8191 | 61.0 | $0.10/1M tokens | No |
| **nomic-embed-text** | Nomic/Ollama | 768 | 8192 | 86.2 (top-5) | Free (local) | **Yes** |
| **mxbai-embed-large** | Mixed Bread/Ollama | 1024 | 512 | SOTA for BERT-large | Free (local) | **Yes** |
| **all-minilm** | Sentence Transformers/Ollama | 384 | 256 | Good | Free (local) | **Yes** |
| **BGE-M3** | BAAI | 1024 | 8192 | Top performer | Free (local) | **Yes** |
| **Voyage AI voyage-3-large** | Voyage AI | 1024 | 32000 | Top-tier | $0.06/1M tokens | No |
| **Nomic Embed v2** | Nomic | Variable | 8192 | Excellent | Free (local) | **Yes** |

### 9.2 Recommended Strategy for SodaWorld

Given the 4-tier cost waterfall philosophy, embeddings should follow the same pattern:

**Tier 0 (Free/Local):** `nomic-embed-text` via Ollama
- Outperforms OpenAI text-embedding-ada-002 and text-embedding-3-small
- 768 dimensions, 8192 token context (matches most chunking strategies)
- Runs entirely local with Ollama — zero API cost
- Perfect alignment with SodaWorld's local-first approach

**Tier 1 (Cheap):** `text-embedding-3-small` via OpenAI API
- Fallback when Ollama is unavailable
- $0.02 per million tokens (~$0.002 for 100 knowledge items)
- 1536 dimensions, good quality

**Tier 2 (Best quality):** `text-embedding-3-large` via OpenAI API
- For high-value embeddings (legal documents, governance proposals)
- $0.13 per million tokens
- 3072 dimensions, best OpenAI quality

### 9.3 Embedding Pipeline for SodaWorld

```typescript
// Embedding provider with cost waterfall
interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  dimensions: number;
  name: string;
}

class OllamaEmbedding implements EmbeddingProvider {
  readonly dimensions = 768;
  readonly name = 'nomic-embed-text';

  async embed(text: string): Promise<number[]> {
    const response = await fetch('http://localhost:11434/api/embeddings', {
      method: 'POST',
      body: JSON.stringify({
        model: 'nomic-embed-text',
        prompt: text,
      }),
    });
    const data = await response.json();
    return data.embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(t => this.embed(t)));
  }
}

class OpenAIEmbedding implements EmbeddingProvider {
  readonly dimensions: number;
  readonly name: string;

  constructor(
    private model: 'text-embedding-3-small' | 'text-embedding-3-large' = 'text-embedding-3-small',
    private apiKey: string,
  ) {
    this.dimensions = model === 'text-embedding-3-large' ? 3072 : 1536;
    this.name = model;
  }

  async embed(text: string): Promise<number[]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: this.model, input: text }),
    });
    const data = await response.json();
    return data.data[0].embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: this.model, input: texts }),
    });
    const data = await response.json();
    return data.data.map((d: any) => d.embedding);
  }
}

// Waterfall: try Ollama first, fall back to OpenAI
async function getEmbeddingProvider(): Promise<EmbeddingProvider> {
  try {
    const ollamaCheck = await fetch('http://localhost:11434/api/tags');
    if (ollamaCheck.ok) {
      return new OllamaEmbedding();
    }
  } catch {
    // Ollama not available
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    return new OpenAIEmbedding('text-embedding-3-small', apiKey);
  }

  throw new Error('No embedding provider available');
}
```

### 9.4 Embedding on Knowledge Ingestion

Embeddings should be generated at **write time** (when knowledge is added) rather than query time:

```typescript
// Modified addKnowledge in BaseModule
protected async addKnowledge(
  daoId: string,
  item: Partial<KnowledgeItem> & { /* ... */ },
): Promise<KnowledgeItem> {
  const id = randomUUID();
  const now = new Date().toISOString();

  // Generate embedding at write time
  let embeddingVector: number[] | null = null;
  try {
    const provider = await getEmbeddingProvider();
    embeddingVector = await provider.embed(
      `${item.title}\n\n${item.content}`
    );
  } catch (err) {
    console.warn(`[${this.moduleName}] Embedding generation failed:`, err);
    // Non-fatal — knowledge stored without embedding
  }

  const record = {
    id,
    dao_id: daoId,
    module_id: this.moduleId,
    // ... other fields ...
    embedding_vector: embeddingVector ? JSON.stringify(embeddingVector) : null,
    created_at: now,
    updated_at: now,
  };

  await this.db('knowledge_items').insert(record);
  return record as KnowledgeItem;
}
```

---

## 10. Document Processing

### 10.1 Landscape (2025-2026)

| Tool | Strengths | Weaknesses | Best For |
|------|-----------|------------|----------|
| **LlamaParse** | Agentic OCR, layout-aware, table extraction | Paid API | High-value legal/financial docs |
| **Unstructured** | Multi-format (PDF, DOCX, HTML, images), open-source | Complex setup | Enterprise document pipelines |
| **LlamaIndex Ingestion Pipeline** | Caching, deduplication, transformation chains | Python-heavy | Full RAG pipeline |
| **pdf-parse (Node.js)** | Simple, lightweight, npm package | Basic text extraction only | Quick PDF parsing |
| **Tesseract.js** | OCR in browser/Node.js, open-source | Lower accuracy than cloud OCR | Scanned document fallback |
| **Azure Document Intelligence** | High accuracy, pre-built models for contracts | Cloud/paid | Enterprise-grade legal docs |

### 10.2 LlamaIndex Ingestion Pipeline

The gold standard for document processing in RAG systems:

```
Document → Loader → Splitter → Embedder → Vector Store
              │         │          │           │
           (PDF,     (Semantic   (nomic-    (sqlite-vec
            DOCX,    chunking)   embed)     or Chroma)
            HTML)
```

Key features:
- **Caching:** Each node + transformation combination is hashed and cached, saving time on subsequent runs
- **Document management:** Uses `doc_id` to de-duplicate and update documents
- **Parallel processing:** Optional parallel transformation pipeline
- **Incremental updates:** Only re-processes changed documents

### 10.3 Document Processing for SodaWorld's DAO Documents

SodaWorld handles several document types that need intelligent processing:

| Document Type | Format | Processing Needs | Module |
|--------------|--------|-----------------|--------|
| Operating agreements | PDF/DOCX | Clause extraction, key terms, dates | Legal |
| Contributor agreements | PDF | Signature detection, term extraction | Legal |
| Governance proposals | Markdown/HTML | Section parsing, impact analysis | Governance |
| Treasury reports | CSV/JSON | Table parsing, trend analysis | Treasury |
| Compliance filings | PDF | Entity extraction, deadline tracking | Compliance |
| Technical documentation | Markdown | Code block extraction, API reference | Technical |
| Token whitepapers | PDF | Tokenomics extraction, distribution parsing | Tokenomics |

### 10.4 Implementation for SodaWorld

```typescript
// Document ingestion pipeline for SodaWorld
import pdf from 'pdf-parse';
import { marked } from 'marked';

interface ProcessedDocument {
  chunks: DocumentChunk[];
  metadata: DocumentMetadata;
  entities: ExtractedEntity[];
}

interface DocumentChunk {
  content: string;
  chunkIndex: number;
  startPage?: number;
  endPage?: number;
  heading?: string;
  tokenCount: number;
}

interface DocumentMetadata {
  title: string;
  type: 'agreement' | 'proposal' | 'report' | 'documentation' | 'other';
  pages: number;
  wordCount: number;
  createdAt: string;
  detectedLanguage: string;
}

async function processDocument(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<ProcessedDocument> {
  let text: string;

  // 1. Extract raw text based on format
  switch (mimeType) {
    case 'application/pdf':
      const pdfData = await pdf(buffer);
      text = pdfData.text;
      break;
    case 'text/markdown':
      text = buffer.toString('utf-8');
      break;
    case 'text/html':
      text = stripHtml(buffer.toString('utf-8'));
      break;
    default:
      text = buffer.toString('utf-8');
  }

  // 2. Detect document type
  const docType = detectDocumentType(text, filename);

  // 3. Chunk based on document type
  const chunks = chunkDocument(text, docType);

  // 4. Extract entities
  const entities = extractEntities(text);

  return {
    chunks,
    metadata: {
      title: extractTitle(text, filename),
      type: docType,
      pages: mimeType === 'application/pdf' ? (await pdf(buffer)).numpages : 1,
      wordCount: text.split(/\s+/).length,
      createdAt: new Date().toISOString(),
      detectedLanguage: 'en',
    },
    entities,
  };
}

function chunkDocument(text: string, docType: string): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];

  // Choose chunk size based on document type
  const chunkConfig = {
    agreement: { size: 1200, overlap: 200 },    // Larger: preserve clause context
    proposal: { size: 600, overlap: 100 },       // Medium: balance detail and breadth
    report: { size: 400, overlap: 80 },          // Smaller: precise data retrieval
    documentation: { size: 800, overlap: 120 },  // Medium-large: code + explanation
    other: { size: 500, overlap: 100 },          // Default
  }[docType] ?? { size: 500, overlap: 100 };

  // Heading-aware chunking: split at headings first
  const sections = text.split(/\n(?=#{1,3}\s)/);

  let chunkIndex = 0;
  for (const section of sections) {
    const heading = section.match(/^(#{1,3}\s.+)/)?.[1] ?? undefined;
    const sectionText = section.replace(/^#{1,3}\s.+\n/, '').trim();

    if (!sectionText) continue;

    // If section fits in one chunk, use it as-is
    if (sectionText.length <= chunkConfig.size * 4) {
      chunks.push({
        content: heading ? `${heading}\n\n${sectionText}` : sectionText,
        chunkIndex: chunkIndex++,
        heading: heading?.replace(/^#+\s/, ''),
        tokenCount: Math.ceil(sectionText.length / 4),
      });
    } else {
      // Split long sections with overlap
      const words = sectionText.split(/\s+/);
      const wordsPerChunk = Math.floor(chunkConfig.size / 5);
      const overlapWords = Math.floor(chunkConfig.overlap / 5);

      for (let i = 0; i < words.length; i += wordsPerChunk - overlapWords) {
        const chunkWords = words.slice(i, i + wordsPerChunk);
        const content = chunkWords.join(' ');
        chunks.push({
          content: heading ? `${heading}\n\n${content}` : content,
          chunkIndex: chunkIndex++,
          heading: heading?.replace(/^#+\s/, ''),
          tokenCount: Math.ceil(content.length / 4),
        });
      }
    }
  }

  return chunks;
}

// Ingest a document into the knowledge base
async function ingestDocument(
  db: Knex,
  daoId: string,
  moduleId: string,
  file: { buffer: Buffer; filename: string; mimeType: string },
  userId: string,
): Promise<{ itemsCreated: number; entitiesExtracted: number }> {
  const processed = await processDocument(file.buffer, file.filename, file.mimeType);
  const embeddingProvider = await getEmbeddingProvider();

  let itemsCreated = 0;

  // Batch embed all chunks
  const chunkTexts = processed.chunks.map(c => c.content);
  const embeddings = await embeddingProvider.embedBatch(chunkTexts);

  // Insert chunks as knowledge items
  for (let i = 0; i < processed.chunks.length; i++) {
    const chunk = processed.chunks[i];
    await db('knowledge_items').insert({
      id: randomUUID(),
      dao_id: daoId,
      module_id: moduleId,
      category: mapDocTypeToCategory(processed.metadata.type),
      title: `${processed.metadata.title} — ${chunk.heading ?? `Part ${chunk.chunkIndex + 1}`}`,
      content: chunk.content,
      source: 'document_upload',
      confidence: 1.0,
      tags: JSON.stringify([processed.metadata.type, file.filename]),
      embedding_vector: JSON.stringify(embeddings[i]),
      created_by: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    itemsCreated++;
  }

  return {
    itemsCreated,
    entitiesExtracted: processed.entities.length,
  };
}
```

### 10.5 OCR for Legal Documents

For scanned legal documents (common in DAO operations — signed agreements, notarized documents):

**Phase 1:** Use `Tesseract.js` for basic OCR (free, runs in Node.js)
**Phase 2:** Upgrade to LlamaParse (agentic OCR) for complex layouts, tables, and handwriting
**Phase 3:** Azure Document Intelligence for enterprise-grade accuracy on contracts

---

## Implementation Priority

### Phase 1 — Immediate (Weeks 1-4)

| Task | Effort | Impact |
|------|--------|--------|
| Add sqlite-vec for vector search | Medium | High — enables semantic retrieval |
| Generate embeddings via Ollama nomic-embed-text | Low | High — local, free embeddings |
| Implement BM25 via SQLite FTS5 | Low | Medium — keyword search for exact terms |
| Add RRF fusion for hybrid search | Low | High — combines BM25 + vector |
| Use the `_query` parameter in `getRelevantKnowledge()` | Low | High — currently unused |
| Add output guardrails (disclaimers, confidence) | Low | High — safety baseline |
| Embed knowledge items at write time | Low | Medium — prerequisite for vector search |
| Add `knowledge_relations` table | Low | Medium — foundation for knowledge graph |

### Phase 2 — Near-term (Months 2-3)

| Task | Effort | Impact |
|------|--------|--------|
| Build MCP servers for Coach, Legal, Treasury | High | High — enables tool use with any MCP client |
| LangGraph multi-module orchestration | High | High — cross-module queries |
| Document processing pipeline (PDF, DOCX) | Medium | High — ingest legal/governance docs |
| Cross-encoder re-ranking | Medium | Medium — improved retrieval accuracy |
| Entity extraction from conversations | Medium | Medium — builds knowledge graph |
| Semantic chunking for documents | Medium | Medium — better retrieval for complex docs |
| NeMo Guardrails integration | Medium | High — comprehensive safety rails |
| Chroma migration evaluation | Low | Low — assess if sqlite-vec is sufficient |

### Phase 3 — Strategic (Months 4-6+)

| Task | Effort | Impact |
|------|--------|--------|
| LoRA fine-tuning for Coach and Legal personas | High | Medium — style improvement |
| Microsoft GraphRAG for global DAO sensemaking | High | High — organizational memory |
| Agentic RAG (agents decide when/how to retrieve) | High | High — adaptive retrieval |
| MCP servers for all 9 modules | High | Medium — complete tool coverage |
| Neo4j evaluation for knowledge graph | Medium | Medium — if SQLite graph outgrown |
| LlamaParse for legal document OCR | Medium | Medium — scanned document support |
| Three-layer guardrail architecture | Medium | High — enterprise-grade safety |
| Contextual RAG (prepend context to chunks) | Medium | Medium — 49% retrieval improvement |

---

## Architecture Diagram — Target State

```
┌─────────────────────────────────────────────────────────────────────┐
│                        USER INTERFACE                               │
│                    (Mission Control / Chat)                          │
└────────────────────────────┬────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│                      INPUT GUARDRAILS                               │
│         PII Detection | Jailbreak Check | Topic Boundary            │
└────────────────────────────┬────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│                     INTENT CLASSIFIER                               │
│          Local classification → Module routing                      │
│          Multi-module detection → Fan-out                           │
└────────┬───────────┬───────────┬───────────┬───────────┬───────────┘
         │           │           │           │           │
    ┌────▼───┐  ┌───▼────┐ ┌───▼────┐ ┌───▼────┐ ┌───▼────┐
    │ Coach  │  │ Legal  │ │Treasury│ │Govern. │ │  ...   │
    │ Module │  │ Module │ │Adviser │ │ Module │ │(5 more)│
    └────┬───┘  └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘
         │          │          │          │          │
         └──────────┴──────────┼──────────┴──────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                    KNOWLEDGE RETRIEVAL                               │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │  BM25 / FTS5 │  │ Vector Search│  │  Knowledge   │              │
│  │  (Keywords)  │  │ (sqlite-vec) │  │  Graph       │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
│         │                 │                 │                       │
│         └─────────┬───────┘                 │                       │
│                   │                         │                       │
│           ┌───────▼───────┐                 │                       │
│           │  RRF Fusion   │─────────────────┘                       │
│           │  + Re-Ranking │                                         │
│           └───────────────┘                                         │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                    MODEL SELECTION                                   │
│                                                                     │
│  Tier 0: Ollama (FREE)  →  Tier 1: Gemini Flash (CHEAP)            │
│  Tier 2: GPT-4o (PRO)   →  Tier 3: Claude (PREMIUM)               │
│                                                                     │
│  Cost Guard: $5/day/session budget enforcement                      │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                     OUTPUT GUARDRAILS                                │
│  Hallucination Check | Disclaimers | PII Scrub | Confidence Score   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                       MEMORY LAYER                                  │
│                                                                     │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌─────────────┐  │
│  │Conversation│  │ Knowledge  │  │ Embedding  │  │  Knowledge  │  │
│  │  History   │  │   Items    │  │  Vectors   │  │  Relations  │  │
│  │(ai_conver- │  │(knowledge_ │  │(sqlite-vec)│  │(entity graph│  │
│  │ sations)   │  │  items)    │  │            │  │   layer)    │  │
│  └────────────┘  └────────────┘  └────────────┘  └─────────────┘  │
│                                                                     │
│                    SQLite (Knex.js)                                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Key Metrics to Track

| Metric | Target (Phase 1) | Target (Phase 3) |
|--------|------------------|------------------|
| Retrieval recall@5 | 70% | 90% |
| Response grounding rate | 60% (RAG-backed) | 95% |
| Hallucination rate | <20% | <5% |
| Avg response latency | <3s | <2s |
| Daily cost per session | <$0.50 | <$0.25 |
| Knowledge items with embeddings | 50% | 100% |
| Cross-module query accuracy | N/A | 80% |

---

## Summary of Technology Choices

| Component | Phase 1 | Phase 2 | Phase 3 |
|-----------|---------|---------|---------|
| **Vector Store** | sqlite-vec | Chroma (if needed) | Weaviate/Qdrant (if SaaS) |
| **Embedding Model** | nomic-embed-text (Ollama) | + text-embedding-3-small fallback | + text-embedding-3-large for legal |
| **Search** | BM25 (FTS5) + vector (RRF) | + cross-encoder re-ranking | + GraphRAG |
| **Orchestration** | Single-module routing | LangGraph multi-module | Full agentic orchestration |
| **Guardrails** | Disclaimer injection + confidence | NeMo Guardrails | Three-layer architecture |
| **Document Processing** | pdf-parse + manual chunking | Heading-aware semantic chunking | LlamaParse + Azure DI |
| **Knowledge Graph** | SQLite relations table | Entity extraction pipeline | Neo4j or GraphRAG |
| **Tool Integration** | REST API (current) | MCP servers (Coach, Legal, Treasury) | MCP for all 9 modules |
| **Fine-Tuning** | None (RAG only) | Evaluation dataset collection | LoRA for Coach + Legal |
| **Chunking** | RecursiveCharacter 500 tokens | Semantic chunking | Contextual RAG chunks |

---

*85+ sources referenced across RAG architecture, vector databases, MCP, multi-agent systems, DAO-specific AI, knowledge graphs, fine-tuning, AI safety, embedding models, and document processing — see full agent transcript for complete bibliography*
