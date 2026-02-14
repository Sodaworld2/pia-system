const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "data", "pia.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const now = new Date().toISOString();
const counts = {};

function addCount(table, n) {
  counts[table] = (counts[table] || 0) + n;
}

function insertOrIgnore(table, rows) {
  if (rows.length === 0) return;
  const cols = Object.keys(rows[0]);
  const placeholders = cols.map(function(c) { return "@" + c; }).join(", ");
  const sql = "INSERT OR IGNORE INTO " + table + " (" + cols.join(", ") + ") VALUES (" + placeholders + ")";
  const stmt = db.prepare(sql);
  let inserted = 0;
  for (const row of rows) {
    const info = stmt.run(row);
    inserted += info.changes;
  }
  addCount(table, inserted);
  return inserted;
}

const seed = db.transaction(function() {
  // 1. USERS
  insertOrIgnore("users", [
    { id: "user-marcus", firebase_uid: null, email: "marcus@sodaworld.io", display_name: "Marcus Chen", avatar_url: null, role: "admin", wallet_address: "0xMARCUS0001", metadata: JSON.stringify({title:"CTO"}), created_at: now, updated_at: now },
    { id: "user-sarah", firebase_uid: null, email: "sarah@sodaworld.io", display_name: "Sarah Williams", avatar_url: null, role: "admin", wallet_address: "0xSARAH0002", metadata: JSON.stringify({title:"CEO"}), created_at: now, updated_at: now },
    { id: "user-james", firebase_uid: null, email: "james@sodaworld.io", display_name: "James Wright", avatar_url: null, role: "admin", wallet_address: "0xJAMES0003", metadata: JSON.stringify({title:"Creative Director"}), created_at: now, updated_at: now },
    { id: "user-lisa", firebase_uid: null, email: "lisa@sodaworld.io", display_name: "Lisa Park", avatar_url: null, role: "member", wallet_address: "0xLISA0004", metadata: JSON.stringify({title:"Legal Counsel"}), created_at: now, updated_at: now },
    { id: "user-david", firebase_uid: null, email: "david@sodaworld.io", display_name: "David Kumar", avatar_url: null, role: "member", wallet_address: "0xDAVID0005", metadata: JSON.stringify({title:"Blockchain Advisor"}), created_at: now, updated_at: now },
    { id: "user-emma", firebase_uid: null, email: "emma@sodaworld.io", display_name: "Emma Rodriguez", avatar_url: null, role: "member", wallet_address: "0xEMMA0006", metadata: JSON.stringify({title:"Smart Contract Dev"}), created_at: now, updated_at: now },
    { id: "user-alex", firebase_uid: null, email: "alex@sodaworld.io", display_name: "Alex Thompson", avatar_url: null, role: "member", wallet_address: "0xALEX0007", metadata: JSON.stringify({title:"Community Manager"}), created_at: now, updated_at: now },
    { id: "user-mia", firebase_uid: null, email: "mia@sodaworld.io", display_name: "Mia Johnson", avatar_url: null, role: "member", wallet_address: "0xMIA0008", metadata: JSON.stringify({title:"Early Adopter"}), created_at: now, updated_at: now },
    { id: "user-noah", firebase_uid: null, email: "noah@sodaworld.io", display_name: "Noah Davis", avatar_url: null, role: "member", wallet_address: "0xNOAH0009", metadata: JSON.stringify({title:"Early Adopter"}), created_at: now, updated_at: now }
  ]);

  // 2. DAO
  insertOrIgnore("daos", [{
    id: "sodaworld-dao-001",
    name: "SodaWorld DAO",
    slug: "sodaworld",
    description: "Decentralized Autonomous Organisation for the SodaWorld ecosystem",
    mission: "Build a community-driven platform for decentralized collaboration",
    phase: "inception",
    governance_model: "founder_led",
    treasury_address: null,
    settings: JSON.stringify({ voting_period_days: 7, min_quorum: 0.5 }),
    founder_id: "user-marcus",
    created_at: now,
    updated_at: now,
  }]);

  // 3. DAO MEMBERS
  var daoId = "sodaworld-dao-001";
  insertOrIgnore("dao_members", [
    { id: "dm-marcus", dao_id: daoId, user_id: "user-marcus", role: "founder", joined_at: now, left_at: null, voting_power: 4, reputation_score: 95, metadata: JSON.stringify({title:"CTO"}) },
    { id: "dm-sarah", dao_id: daoId, user_id: "user-sarah", role: "founder", joined_at: now, left_at: null, voting_power: 4, reputation_score: 92, metadata: JSON.stringify({title:"CEO"}) },
    { id: "dm-james", dao_id: daoId, user_id: "user-james", role: "founder", joined_at: now, left_at: null, voting_power: 3, reputation_score: 88, metadata: JSON.stringify({title:"Creative Director"}) },
    { id: "dm-lisa", dao_id: daoId, user_id: "user-lisa", role: "advisor", joined_at: now, left_at: null, voting_power: 2, reputation_score: 85, metadata: JSON.stringify({title:"Legal Counsel"}) },
    { id: "dm-david", dao_id: daoId, user_id: "user-david", role: "advisor", joined_at: now, left_at: null, voting_power: 1.5, reputation_score: 82, metadata: JSON.stringify({title:"Blockchain Advisor"}) },
    { id: "dm-emma", dao_id: daoId, user_id: "user-emma", role: "contributor", joined_at: now, left_at: null, voting_power: 1, reputation_score: 78, metadata: JSON.stringify({title:"Smart Contract Dev"}) },
    { id: "dm-alex", dao_id: daoId, user_id: "user-alex", role: "contributor", joined_at: now, left_at: null, voting_power: 0.5, reputation_score: 75, metadata: JSON.stringify({title:"Community Manager"}) },
    { id: "dm-mia", dao_id: daoId, user_id: "user-mia", role: "member", joined_at: now, left_at: null, voting_power: 0.25, reputation_score: 70, metadata: JSON.stringify({title:"Early Adopter"}) },
    { id: "dm-noah", dao_id: daoId, user_id: "user-noah", role: "member", joined_at: now, left_at: null, voting_power: 0.25, reputation_score: 68, metadata: JSON.stringify({title:"Early Adopter"}) }
  ]);

  // 4. AGREEMENTS
  insertOrIgnore("agreements", [
    { id: "agree-operating-001", dao_id: daoId, title: "SodaWorld DAO Operating Agreement", type: "operating", status: "active", version: 1, content_markdown: "# SodaWorld DAO Operating Agreement\n\nThis agreement governs the operations of the SodaWorld DAO, including governance structure, decision-making processes, treasury management, and member rights and responsibilities.\n\n## Article 1 - Purpose\nThe SodaWorld DAO exists to build and maintain a decentralized collaboration platform.\n\n## Article 2 - Governance\nFounder-led governance during inception phase, transitioning to token-weighted voting.\n\n## Article 3 - Treasury\nAll treasury actions require proposal approval with minimum 50% quorum.", terms: JSON.stringify({ governing_law: "Wyoming DAO LLC", dispute_resolution: "arbitration", amendment_threshold: 0.75 }), created_by: "user-marcus", parent_agreement_id: null, created_at: now, updated_at: now },
    { id: "agree-contributor-001", dao_id: daoId, title: "Contributor Agreement Template", type: "contributor", status: "active", version: 1, content_markdown: "# Contributor Agreement\n\nBy signing this agreement, the contributor agrees to:\n\n1. Assign IP rights for work produced within the DAO scope\n2. Follow the DAO code of conduct\n3. Participate in good faith governance\n4. Maintain confidentiality of non-public information\n\n## Compensation\nContributors are compensated through bounties, token allocations, and reputation points.", terms: JSON.stringify({ ip_assignment: true, non_compete: false, termination_notice_days: 30 }), created_by: "user-sarah", parent_agreement_id: null, created_at: now, updated_at: now },
    { id: "agree-nda-001", dao_id: daoId, title: "NDA Template", type: "nda", status: "active", version: 1, content_markdown: "# Non-Disclosure Agreement\n\nThis NDA protects confidential information shared within the SodaWorld DAO ecosystem.\n\n## Scope\nAll proprietary technology, business strategies, financial data, and member information.\n\n## Duration\n2 years from the date of signing.\n\n## Exceptions\nPublicly available information and information independently developed.", terms: JSON.stringify({ duration_years: 2, scope: "all_confidential", penalty_clause: true }), created_by: "user-lisa", parent_agreement_id: null, created_at: now, updated_at: now }
  ]);

  // 5. PROPOSALS
  var votingStart = new Date(Date.now() - 3 * 86400000).toISOString();
  var votingEnd = new Date(Date.now() + 4 * 86400000).toISOString();
  var passedStart = new Date(Date.now() - 10 * 86400000).toISOString();
  var passedEnd = new Date(Date.now() - 3 * 86400000).toISOString();

  insertOrIgnore("proposals", [
    { id: "prop-marketing-001", dao_id: daoId, title: "Marketing Budget Allocation", description: "Proposal to allocate 15,000 USDC from the treasury for Q1 2026 marketing activities including social media campaigns, conference sponsorships, and community growth initiatives.", type: "treasury_spend", status: "active", author_id: "user-sarah", voting_starts_at: votingStart, voting_ends_at: votingEnd, quorum_required: 0.5, approval_threshold: 0.6, execution_payload: JSON.stringify({ action: "transfer", amount: 15000, token: "USDC", recipient: "marketing-multisig" }), result_summary: null, created_at: votingStart, updated_at: now },
    { id: "prop-oracle-001", dao_id: daoId, title: "Oracle Integration", description: "Integrate Chainlink oracle services for reliable off-chain data feeds to support the SodaWorld smart contract ecosystem. This will enable price feeds, verifiable randomness, and external API connectivity.", type: "custom", status: "passed", author_id: "user-marcus", voting_starts_at: passedStart, voting_ends_at: passedEnd, quorum_required: 0.5, approval_threshold: 0.5, execution_payload: JSON.stringify({ action: "integrate_oracle", provider: "chainlink", networks: ["ethereum", "polygon"] }), result_summary: JSON.stringify({ yes: 11.0, no: 0, abstain: 2.0, total_weight: 13.0, quorum_met: true, approved: true }), created_at: passedStart, updated_at: passedEnd }
  ]);

  // 6. VOTES on Oracle Integration
  var voteTime = new Date(Date.now() - 5 * 86400000).toISOString();
  insertOrIgnore("votes", [
    { id: "vote-oracle-marcus", proposal_id: "prop-oracle-001", user_id: "user-marcus", choice: "yes", weight: 4.0, reason: "Critical infrastructure for our smart contract ecosystem. Chainlink is the industry standard.", cast_at: voteTime },
    { id: "vote-oracle-sarah", proposal_id: "prop-oracle-001", user_id: "user-sarah", choice: "yes", weight: 4.0, reason: "Strong alignment with our product roadmap. Oracle data feeds will unlock new features.", cast_at: voteTime },
    { id: "vote-oracle-james", proposal_id: "prop-oracle-001", user_id: "user-james", choice: "yes", weight: 3.0, reason: "Supports the creative vision for dynamic content pricing and verification.", cast_at: voteTime },
    { id: "vote-oracle-lisa", proposal_id: "prop-oracle-001", user_id: "user-lisa", choice: "abstain", weight: 2.0, reason: "Need more time to review the legal implications of oracle dependency.", cast_at: voteTime }
  ]);
});

seed();

console.log("");
console.log("=== SodaWorld DAO Seed Results ===");
console.log("");
var totalInserted = 0;
for (var table of Object.keys(counts)) {
  console.log("  " + table + ": " + counts[table] + " row(s) inserted");
  totalInserted += counts[table];
}
console.log("");
console.log("  TOTAL: " + totalInserted + " rows inserted");

console.log("");
console.log("=== Verification Counts ===");
console.log("");
var verifyTables = ["users", "daos", "dao_members", "agreements", "proposals", "votes"];
for (var t of verifyTables) {
  var row = db.prepare("SELECT COUNT(*) as c FROM " + t).get();
  console.log("  " + t + ": " + row.c + " total rows in table");
}

db.close();
console.log("");
console.log("Done. Database closed.");
