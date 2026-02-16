import urllib.request, json, time, re, base64

M3_PIA = "http://100.102.217.69:3000"
SID = "8Tt609LYFkJ5KRWOgrBZH"

def send_cmd(cmd):
    data = json.dumps({"data": cmd + "\r\n"}).encode()
    req = urllib.request.Request(f"{M3_PIA}/api/sessions/{SID}/input", data=data, headers={"Content-Type": "application/json"}, method="POST")
    return urllib.request.urlopen(req, timeout=10).read().decode()

def read_buffer(chars=15000):
    req = urllib.request.Request(f"{M3_PIA}/api/sessions/{SID}")
    data = json.loads(urllib.request.urlopen(req, timeout=10).read().decode())
    buf = data.get("buffer", "")
    clean = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', buf[-chars:])
    clean = re.sub(r'\x1b\[\?[0-9;]*[a-zA-Z]', '', clean)
    return ''.join(c if ord(c) < 128 else '?' for c in clean)

# =============================================================================
# Inner script to run on Machine #3
# =============================================================================
inner_script = r'''
import sqlite3, json, uuid
from datetime import datetime, timedelta

DB_PATH = r'C:\Users\User\Documents\GitHub\DAOV1\backend\mentor_chats.db'
db = sqlite3.connect(DB_PATH)
db.execute("PRAGMA journal_mode=WAL")
cur = db.cursor()
now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
counts = {}

def add_count(table, n):
    counts[table] = counts.get(table, 0) + n

def insert_or_ignore(table, rows):
    if not rows:
        return
    for row in rows:
        cols = list(row.keys())
        placeholders = ','.join(['?' for _ in cols])
        sql = f"INSERT OR IGNORE INTO {table} ({','.join(cols)}) VALUES ({placeholders})"
        vals = [row[c] for c in cols]
        cur.execute(sql, vals)
        if cur.rowcount > 0:
            add_count(table, 1)

# =============================================================================
# 1. PROPOSALS (8 new realistic proposals)
# =============================================================================
print("=== Adding Proposals ===")
insert_or_ignore("proposals", [
    {
        "id": "p3",
        "title": "Q1 Marketing Budget Allocation",
        "description": "Allocate 200,000 SODA tokens for Q1 2026 marketing initiatives including influencer partnerships with top crypto YouTubers, Twitter Spaces campaigns, and sponsorship of ETHDenver 2026. Budget breakdown: Influencer partnerships (80k), social media ads (50k), conference sponsorships (40k), content creation (30k).",
        "proposer": json.dumps({"name": "Alex Thompson", "avatarUrl": "https://picsum.photos/seed/alex/100/100"}),
        "status": "Active",
        "votesFor": 1850000,
        "votesAgainst": 320000,
        "votesAbstain": 150000,
        "endDate": "5 days remaining",
        "dao_id": None,
        "type": "treasury_spend",
        "author_id": None,
        "voting_starts_at": "2026-02-10T00:00:00Z",
        "voting_ends_at": "2026-02-19T00:00:00Z",
        "quorum_required": 0.5,
        "approval_threshold": 0.6,
        "execution_payload": json.dumps({"action": "transfer", "amount": 200000, "token": "SODA", "recipient": "marketing-multisig"}),
        "result_summary": None
    },
    {
        "id": "p4",
        "title": "Partnership with Coca-Cola Ventures",
        "description": "Establish a strategic partnership with Coca-Cola Ventures to explore tokenized loyalty programs for beverage brands. The partnership includes a $500k investment from Coca-Cola Ventures, co-development of a Web3 loyalty SDK, and exclusive pilot program with 3 Coca-Cola brands. Legal review has been completed by Lisa Park.",
        "proposer": json.dumps({"name": "Sarah Williams", "avatarUrl": "https://picsum.photos/seed/sarah/100/100"}),
        "status": "Passed",
        "votesFor": 3200000,
        "votesAgainst": 100000,
        "votesAbstain": 200000,
        "endDate": "Ended 5 days ago",
        "dao_id": None,
        "type": "custom",
        "author_id": None,
        "voting_starts_at": "2026-01-25T00:00:00Z",
        "voting_ends_at": "2026-02-01T00:00:00Z",
        "quorum_required": 0.5,
        "approval_threshold": 0.6,
        "execution_payload": json.dumps({"action": "partnership", "partner": "Coca-Cola Ventures", "investment_usd": 500000}),
        "result_summary": json.dumps({"votes_for": 3200000, "votes_against": 100000, "abstain": 200000, "quorum_met": True, "approved": True})
    },
    {
        "id": "p5",
        "title": "Launch Genesis NFT Collection",
        "description": "Launch the SodaWorld Genesis NFT Collection - 10,000 unique beverage-themed NFTs on Solana. Each NFT grants governance voting multiplier (1.5x), exclusive Discord access, real-world soda brand discounts, and early access to all future launches. Minting price: 0.5 SOL. Revenue split: 70% treasury, 20% artists, 10% marketing.",
        "proposer": json.dumps({"name": "James Wright", "avatarUrl": "https://picsum.photos/seed/james/100/100"}),
        "status": "Active",
        "votesFor": 2100000,
        "votesAgainst": 680000,
        "votesAbstain": 90000,
        "endDate": "2 days remaining",
        "dao_id": None,
        "type": "custom",
        "author_id": None,
        "voting_starts_at": "2026-02-08T00:00:00Z",
        "voting_ends_at": "2026-02-16T00:00:00Z",
        "quorum_required": 0.5,
        "approval_threshold": 0.5,
        "execution_payload": json.dumps({"action": "nft_launch", "collection_size": 10000, "mint_price_sol": 0.5, "chain": "solana"}),
        "result_summary": None
    },
    {
        "id": "p6",
        "title": "Community Rewards Program v2",
        "description": "Revamp the community rewards program with tiered benefits. Bronze tier (hold 1k SODA): basic governance rights. Silver tier (hold 10k SODA): 1.25x voting, monthly AMA access. Gold tier (hold 100k SODA): 1.5x voting, quarterly strategy calls, merchandise. Diamond tier (hold 1M SODA): 2x voting, board observer rights, annual retreat invite. Estimated annual cost: 500,000 SODA.",
        "proposer": json.dumps({"name": "Alex Thompson", "avatarUrl": "https://picsum.photos/seed/alex/100/100"}),
        "status": "Passed",
        "votesFor": 2900000,
        "votesAgainst": 450000,
        "votesAbstain": 50000,
        "endDate": "Ended 10 days ago",
        "dao_id": None,
        "type": "parameter_change",
        "author_id": None,
        "voting_starts_at": "2026-01-20T00:00:00Z",
        "voting_ends_at": "2026-01-27T00:00:00Z",
        "quorum_required": 0.5,
        "approval_threshold": 0.5,
        "execution_payload": json.dumps({"action": "rewards_update", "tiers": ["Bronze","Silver","Gold","Diamond"], "annual_budget": 500000}),
        "result_summary": json.dumps({"votes_for": 2900000, "votes_against": 450000, "abstain": 50000, "quorum_met": True, "approved": True})
    },
    {
        "id": "p7",
        "title": "Hire VP of Engineering",
        "description": "Authorize hiring a VP of Engineering to lead the platform development team. Compensation package: 150,000 USDC annual salary + 2,000,000 SODA tokens vesting over 4 years with 1-year cliff. The VP will oversee smart contract development, API infrastructure, and front-end engineering. Marcus Chen (CTO) will lead the search committee.",
        "proposer": json.dumps({"name": "Marcus Chen", "avatarUrl": "https://picsum.photos/seed/marcus/100/100"}),
        "status": "Active",
        "votesFor": 1600000,
        "votesAgainst": 900000,
        "votesAbstain": 400000,
        "endDate": "4 days remaining",
        "dao_id": None,
        "type": "treasury_spend",
        "author_id": None,
        "voting_starts_at": "2026-02-09T00:00:00Z",
        "voting_ends_at": "2026-02-18T00:00:00Z",
        "quorum_required": 0.5,
        "approval_threshold": 0.6,
        "execution_payload": json.dumps({"action": "hire", "role": "VP of Engineering", "salary_usdc": 150000, "token_grant": 2000000}),
        "result_summary": None
    },
    {
        "id": "p8",
        "title": "Open Source SDK Release",
        "description": "Release the SodaWorld Developer SDK as open source under MIT license. The SDK includes: TypeScript/JavaScript client library, Solana program interfaces, governance module SDK, treasury API wrappers, and example applications. This will accelerate third-party development and establish SodaWorld as a platform for the beverage industry Web3 ecosystem.",
        "proposer": json.dumps({"name": "Emma Rodriguez", "avatarUrl": "https://picsum.photos/seed/emma/100/100"}),
        "status": "Passed",
        "votesFor": 3400000,
        "votesAgainst": 50000,
        "votesAbstain": 100000,
        "endDate": "Ended 8 days ago",
        "dao_id": None,
        "type": "custom",
        "author_id": None,
        "voting_starts_at": "2026-01-28T00:00:00Z",
        "voting_ends_at": "2026-02-04T00:00:00Z",
        "quorum_required": 0.5,
        "approval_threshold": 0.5,
        "execution_payload": json.dumps({"action": "sdk_release", "license": "MIT", "repo": "github.com/sodaworld/sdk"}),
        "result_summary": json.dumps({"votes_for": 3400000, "votes_against": 50000, "abstain": 100000, "quorum_met": True, "approved": True})
    },
    {
        "id": "p9",
        "title": "DeFi Integration Roadmap",
        "description": "Approve the DeFi integration roadmap for Q2-Q3 2026. Phase 1 (Q2): Launch SODA/USDC liquidity pool on Raydium with 1M SODA liquidity mining rewards. Phase 2 (Q2): Integrate with Marinade Finance for SOL staking rewards. Phase 3 (Q3): Launch SODA lending/borrowing on Solend. Phase 4 (Q3): Cross-chain bridge to Ethereum via Wormhole. Total budget: 3,000,000 SODA for liquidity incentives.",
        "proposer": json.dumps({"name": "David Kumar", "avatarUrl": "https://picsum.photos/seed/david/100/100"}),
        "status": "Pending",
        "votesFor": 0,
        "votesAgainst": 0,
        "votesAbstain": 0,
        "endDate": "Voting starts in 3 days",
        "dao_id": None,
        "type": "parameter_change",
        "author_id": None,
        "voting_starts_at": "2026-02-17T00:00:00Z",
        "voting_ends_at": "2026-02-24T00:00:00Z",
        "quorum_required": 0.5,
        "approval_threshold": 0.6,
        "execution_payload": json.dumps({"action": "defi_roadmap", "phases": 4, "budget_soda": 3000000}),
        "result_summary": None
    },
    {
        "id": "p10",
        "title": "Annual Token Burn Proposal",
        "description": "Implement an annual token burn mechanism to reduce SODA supply and increase scarcity. Proposal: Burn 2% of total supply (200,000,000 tokens from the unallocated reserve) on the anniversary of DAO formation. This creates deflationary pressure and rewards long-term holders. The burn will be executed via a verified smart contract with on-chain proof.",
        "proposer": json.dumps({"name": "David Kumar", "avatarUrl": "https://picsum.photos/seed/david/100/100"}),
        "status": "Failed",
        "votesFor": 900000,
        "votesAgainst": 2100000,
        "votesAbstain": 300000,
        "endDate": "Ended 3 days ago",
        "dao_id": None,
        "type": "parameter_change",
        "author_id": None,
        "voting_starts_at": "2026-02-01T00:00:00Z",
        "voting_ends_at": "2026-02-08T00:00:00Z",
        "quorum_required": 0.5,
        "approval_threshold": 0.6,
        "execution_payload": json.dumps({"action": "token_burn", "burn_percentage": 2, "tokens_to_burn": 200000000}),
        "result_summary": json.dumps({"votes_for": 900000, "votes_against": 2100000, "abstain": 300000, "quorum_met": True, "approved": False})
    }
])

# =============================================================================
# 2. PROPOSAL VOTES (on all proposals with realistic voting patterns)
# =============================================================================
print("=== Adding Proposal Votes ===")
# Council members for reference:
# id=1: Marcus Chen (founder, wallet: 7xKXtg2CW87d97TXJSDpbD6jBHqNRf1S3wFTa7rBFBwi)
# id=2: Sarah Williams (founder, wallet: 9xKXtg2CW87d97TXJSDpbD6jBHqNRf1S3wFTa7rBFBwj)
# id=3: James Wright (founder, wallet: 3xKXtg2CW87d97TXJSDpbD6jBHqNRf1S3wFTa7rBFBwk)
# id=4: Lisa Park (advisor)
# id=5: David Kumar (advisor)
# id=6: Emma Rodriguez (contributor)
# id=7: Alex Thompson (contributor)
# id=8: Mia Johnson (firstborn)
# id=9: Noah Davis (firstborn)

wallets = {
    "Marcus": "7xKXtg2CW87d97TXJSDpbD6jBHqNRf1S3wFTa7rBFBwi",
    "Sarah": "9xKXtg2CW87d97TXJSDpbD6jBHqNRf1S3wFTa7rBFBwj",
    "James": "3xKXtg2CW87d97TXJSDpbD6jBHqNRf1S3wFTa7rBFBwk",
    "Lisa": "0xLISA0004",
    "David": "0xDAVID0005",
    "Emma": "0xEMMA0006",
    "Alex": "0xALEX0007",
    "Mia": "0xMIA0008",
    "Noah": "0xNOAH0009"
}

vote_data = [
    # p1 votes (Q3 Budget - Active)
    ("pv-p1-1", "p1", wallets["Marcus"], "for", 4000000, "2026-02-11T10:00:00Z"),
    ("pv-p1-2", "p1", wallets["Sarah"], "for", 4000000, "2026-02-11T11:00:00Z"),
    ("pv-p1-3", "p1", wallets["James"], "abstain", 3000000, "2026-02-11T14:00:00Z"),
    ("pv-p1-4", "p1", wallets["Lisa"], "against", 2000000, "2026-02-12T09:00:00Z"),
    ("pv-p1-5", "p1", wallets["Emma"], "for", 1000000, "2026-02-12T11:00:00Z"),

    # p2 votes (Oracle - Passed)
    ("pv-p2-1", "p2", wallets["Marcus"], "for", 4000000, "2026-02-06T09:00:00Z"),
    ("pv-p2-2", "p2", wallets["Sarah"], "for", 4000000, "2026-02-06T10:00:00Z"),
    ("pv-p2-3", "p2", wallets["James"], "for", 3000000, "2026-02-06T14:00:00Z"),
    ("pv-p2-4", "p2", wallets["David"], "for", 1500000, "2026-02-07T08:00:00Z"),
    ("pv-p2-5", "p2", wallets["Emma"], "for", 1000000, "2026-02-07T10:00:00Z"),
    ("pv-p2-6", "p2", wallets["Alex"], "for", 500000, "2026-02-07T12:00:00Z"),
    ("pv-p2-7", "p2", wallets["Lisa"], "abstain", 2000000, "2026-02-07T15:00:00Z"),

    # p3 votes (Q1 Marketing)
    ("pv-p3-1", "p3", wallets["Sarah"], "for", 4000000, "2026-02-10T09:00:00Z"),
    ("pv-p3-2", "p3", wallets["Alex"], "for", 500000, "2026-02-10T10:00:00Z"),
    ("pv-p3-3", "p3", wallets["Marcus"], "for", 4000000, "2026-02-10T14:00:00Z"),
    ("pv-p3-4", "p3", wallets["James"], "for", 3000000, "2026-02-11T08:00:00Z"),
    ("pv-p3-5", "p3", wallets["Lisa"], "against", 2000000, "2026-02-11T11:00:00Z"),
    ("pv-p3-6", "p3", wallets["Mia"], "for", 500000, "2026-02-12T09:00:00Z"),

    # p4 votes (Coca-Cola Partnership - Passed overwhelmingly)
    ("pv-p4-1", "p4", wallets["Sarah"], "for", 4000000, "2026-01-26T09:00:00Z"),
    ("pv-p4-2", "p4", wallets["Marcus"], "for", 4000000, "2026-01-26T10:00:00Z"),
    ("pv-p4-3", "p4", wallets["James"], "for", 3000000, "2026-01-26T14:00:00Z"),
    ("pv-p4-4", "p4", wallets["Lisa"], "for", 2000000, "2026-01-27T08:00:00Z"),
    ("pv-p4-5", "p4", wallets["David"], "for", 1500000, "2026-01-27T10:00:00Z"),
    ("pv-p4-6", "p4", wallets["Emma"], "for", 1000000, "2026-01-27T12:00:00Z"),
    ("pv-p4-7", "p4", wallets["Alex"], "for", 500000, "2026-01-28T09:00:00Z"),
    ("pv-p4-8", "p4", wallets["Mia"], "abstain", 500000, "2026-01-28T10:00:00Z"),
    ("pv-p4-9", "p4", wallets["Noah"], "abstain", 250000, "2026-01-28T14:00:00Z"),

    # p5 votes (Genesis NFT - Active, contentious)
    ("pv-p5-1", "p5", wallets["James"], "for", 3000000, "2026-02-09T09:00:00Z"),
    ("pv-p5-2", "p5", wallets["Sarah"], "for", 4000000, "2026-02-09T11:00:00Z"),
    ("pv-p5-3", "p5", wallets["Marcus"], "against", 4000000, "2026-02-09T14:00:00Z"),
    ("pv-p5-4", "p5", wallets["David"], "against", 1500000, "2026-02-10T08:00:00Z"),
    ("pv-p5-5", "p5", wallets["Emma"], "for", 1000000, "2026-02-10T10:00:00Z"),
    ("pv-p5-6", "p5", wallets["Mia"], "for", 500000, "2026-02-10T14:00:00Z"),

    # p6 votes (Community Rewards v2 - Passed)
    ("pv-p6-1", "p6", wallets["Sarah"], "for", 4000000, "2026-01-21T09:00:00Z"),
    ("pv-p6-2", "p6", wallets["Marcus"], "for", 4000000, "2026-01-21T10:00:00Z"),
    ("pv-p6-3", "p6", wallets["Alex"], "for", 500000, "2026-01-21T14:00:00Z"),
    ("pv-p6-4", "p6", wallets["James"], "for", 3000000, "2026-01-22T08:00:00Z"),
    ("pv-p6-5", "p6", wallets["Emma"], "for", 1000000, "2026-01-22T10:00:00Z"),
    ("pv-p6-6", "p6", wallets["David"], "against", 1500000, "2026-01-22T12:00:00Z"),
    ("pv-p6-7", "p6", wallets["Lisa"], "for", 2000000, "2026-01-23T09:00:00Z"),

    # p7 votes (VP of Engineering - Active, divided)
    ("pv-p7-1", "p7", wallets["Marcus"], "for", 4000000, "2026-02-10T09:00:00Z"),
    ("pv-p7-2", "p7", wallets["Sarah"], "for", 4000000, "2026-02-10T11:00:00Z"),
    ("pv-p7-3", "p7", wallets["Lisa"], "against", 2000000, "2026-02-10T14:00:00Z"),
    ("pv-p7-4", "p7", wallets["David"], "against", 1500000, "2026-02-11T08:00:00Z"),
    ("pv-p7-5", "p7", wallets["Emma"], "for", 1000000, "2026-02-11T10:00:00Z"),
    ("pv-p7-6", "p7", wallets["Mia"], "abstain", 500000, "2026-02-11T14:00:00Z"),
    ("pv-p7-7", "p7", wallets["Noah"], "abstain", 250000, "2026-02-12T09:00:00Z"),

    # p8 votes (Open Source SDK - Passed near-unanimously)
    ("pv-p8-1", "p8", wallets["Marcus"], "for", 4000000, "2026-01-29T09:00:00Z"),
    ("pv-p8-2", "p8", wallets["Sarah"], "for", 4000000, "2026-01-29T10:00:00Z"),
    ("pv-p8-3", "p8", wallets["James"], "for", 3000000, "2026-01-29T14:00:00Z"),
    ("pv-p8-4", "p8", wallets["Emma"], "for", 1000000, "2026-01-30T08:00:00Z"),
    ("pv-p8-5", "p8", wallets["David"], "for", 1500000, "2026-01-30T10:00:00Z"),
    ("pv-p8-6", "p8", wallets["Alex"], "for", 500000, "2026-01-30T12:00:00Z"),
    ("pv-p8-7", "p8", wallets["Lisa"], "for", 2000000, "2026-01-31T09:00:00Z"),
    ("pv-p8-8", "p8", wallets["Mia"], "for", 500000, "2026-01-31T10:00:00Z"),

    # p9 votes (DeFi Roadmap - Pending, no votes yet)
    # (none)

    # p10 votes (Token Burn - Failed)
    ("pv-p10-1", "p10", wallets["David"], "for", 1500000, "2026-02-02T09:00:00Z"),
    ("pv-p10-2", "p10", wallets["Marcus"], "against", 4000000, "2026-02-02T10:00:00Z"),
    ("pv-p10-3", "p10", wallets["Sarah"], "against", 4000000, "2026-02-02T14:00:00Z"),
    ("pv-p10-4", "p10", wallets["James"], "against", 3000000, "2026-02-03T08:00:00Z"),
    ("pv-p10-5", "p10", wallets["Lisa"], "for", 2000000, "2026-02-03T10:00:00Z"),
    ("pv-p10-6", "p10", wallets["Emma"], "against", 1000000, "2026-02-03T12:00:00Z"),
    ("pv-p10-7", "p10", wallets["Mia"], "abstain", 500000, "2026-02-04T09:00:00Z"),
    ("pv-p10-8", "p10", wallets["Noah"], "abstain", 250000, "2026-02-04T10:00:00Z"),
]

for v in vote_data:
    insert_or_ignore("proposal_votes", {
        "id": v[0],
        "proposal_id": v[1],
        "voter_address": v[2],
        "vote_type": v[3],
        "voting_power": v[4],
        "voted_at": v[5]
    })

# =============================================================================
# 3. VOTES table (the other votes table with user_id references)
# =============================================================================
print("=== Adding Votes (user-referenced) ===")
users = ["user-marcus", "user-sarah", "user-james", "user-lisa", "user-david", "user-emma", "user-alex", "user-mia", "user-noah"]
vote_records = [
    # Oracle proposal (p2)
    ("v-p2-marcus", "p2", "user-marcus", "yes", 4.0, "Strong technical decision. Chainlink is battle-tested."),
    ("v-p2-sarah", "p2", "user-sarah", "yes", 4.0, "Aligns with our product roadmap for price feeds."),
    ("v-p2-james", "p2", "user-james", "yes", 3.0, "Enables dynamic pricing for NFT marketplace."),
    ("v-p2-david", "p2", "user-david", "yes", 1.5, "Essential infrastructure. I recommend Chainlink V2."),
    ("v-p2-emma", "p2", "user-emma", "yes", 1.0, "Already prototyped the integration. Ready to ship."),
    ("v-p2-lisa", "p2", "user-lisa", "abstain", 2.0, "Need to review oracle service agreement terms."),

    # Coca-Cola Partnership (p4)
    ("v-p4-sarah", "p4", "user-sarah", "yes", 4.0, "Transformative partnership. Due diligence complete."),
    ("v-p4-marcus", "p4", "user-marcus", "yes", 4.0, "Technical integration is feasible. Great opportunity."),
    ("v-p4-james", "p4", "user-james", "yes", 3.0, "Massive brand credibility boost for SodaWorld."),
    ("v-p4-lisa", "p4", "user-lisa", "yes", 2.0, "Legal review passed. Terms are favorable."),
    ("v-p4-david", "p4", "user-david", "yes", 1.5, "Smart money validation for our token."),
    ("v-p4-emma", "p4", "user-emma", "yes", 1.0, "SDK integration with their systems is doable."),
    ("v-p4-alex", "p4", "user-alex", "yes", 0.5, "Community is very excited about this."),

    # Community Rewards v2 (p6)
    ("v-p6-sarah", "p6", "user-sarah", "yes", 4.0, "Community retention is critical at this stage."),
    ("v-p6-marcus", "p6", "user-marcus", "yes", 4.0, "Gamification will drive engagement."),
    ("v-p6-alex", "p6", "user-alex", "yes", 0.5, "Our community has been asking for this!"),
    ("v-p6-david", "p6", "user-david", "no", 1.5, "Concerned about token inflation from rewards."),

    # Open Source SDK (p8)
    ("v-p8-marcus", "p8", "user-marcus", "yes", 4.0, "Open source is the way. Will attract developers."),
    ("v-p8-sarah", "p8", "user-sarah", "yes", 4.0, "Developer ecosystem is key to platform growth."),
    ("v-p8-emma", "p8", "user-emma", "yes", 1.0, "Ive been building this. Excited to release it."),
    ("v-p8-david", "p8", "user-david", "yes", 1.5, "MIT license is the right choice for adoption."),

    # Token Burn (p10 - Failed)
    ("v-p10-david", "p10", "user-david", "yes", 1.5, "Deflationary mechanism benefits long-term holders."),
    ("v-p10-marcus", "p10", "user-marcus", "no", 4.0, "We need tokens for liquidity mining and partnerships."),
    ("v-p10-sarah", "p10", "user-sarah", "no", 4.0, "Premature. Lets build utility first, not artificial scarcity."),
    ("v-p10-james", "p10", "user-james", "no", 3.0, "Agree with Sarah. Focus on building value."),
    ("v-p10-lisa", "p10", "user-lisa", "yes", 2.0, "Token burn is standard practice in successful DAOs."),
    ("v-p10-emma", "p10", "user-emma", "no", 1.0, "We need those tokens for developer bounties."),
]

for v in vote_records:
    insert_or_ignore("votes", {
        "id": v[0],
        "proposal_id": v[1],
        "user_id": v[2],
        "choice": v[3],
        "weight": v[4],
        "reason": v[5],
        "cast_at": "2026-02-05T12:00:00Z"
    })

# =============================================================================
# 4. AGREEMENT SIGNATURES
# =============================================================================
print("=== Adding Agreement Signatures ===")
sig_data = [
    # Founder agreements all signed
    ("sig-f1-marcus", "agr-f1", wallets["Marcus"], "0xSIG_MARCUS_F1_" + "a" * 40, True, "2024-01-15T10:00:00Z"),
    ("sig-f1-sarah", "agr-f1", wallets["Sarah"], "0xSIG_SARAH_WITNESS_" + "b" * 36, True, "2024-01-15T10:30:00Z"),
    ("sig-f2-sarah", "agr-f2", wallets["Sarah"], "0xSIG_SARAH_F2_" + "c" * 40, True, "2024-01-15T11:00:00Z"),
    ("sig-f2-marcus", "agr-f2", wallets["Marcus"], "0xSIG_MARCUS_WITNESS_" + "d" * 35, True, "2024-01-15T11:30:00Z"),
    ("sig-f3-james", "agr-f3", wallets["James"], "0xSIG_JAMES_F3_" + "e" * 40, True, "2024-01-20T09:00:00Z"),
    ("sig-f3-sarah", "agr-f3", wallets["Sarah"], "0xSIG_SARAH_WITNESS_F3_" + "f" * 33, True, "2024-01-20T09:30:00Z"),

    # Advisor agreements signed
    ("sig-a1-lisa", "agr-a1", wallets["Lisa"], "0xSIG_LISA_A1_" + "1" * 42, True, "2024-02-01T10:00:00Z"),
    ("sig-a1-sarah", "agr-a1", wallets["Sarah"], "0xSIG_SARAH_WITNESS_A1_" + "2" * 33, True, "2024-02-01T10:30:00Z"),
    ("sig-a2-david", "agr-a2", wallets["David"], "0xSIG_DAVID_A2_" + "3" * 40, True, "2024-02-01T11:00:00Z"),
    ("sig-a2-sarah", "agr-a2", wallets["Sarah"], "0xSIG_SARAH_WITNESS_A2_" + "4" * 33, True, "2024-02-01T11:30:00Z"),

    # Contributor agreements signed
    ("sig-c1-emma", "agr-c1", wallets["Emma"], "0xSIG_EMMA_C1_" + "5" * 41, True, "2024-02-05T09:00:00Z"),
    ("sig-c1-marcus", "agr-c1", wallets["Marcus"], "0xSIG_MARCUS_WITNESS_C1_" + "6" * 32, True, "2024-02-05T09:30:00Z"),
    ("sig-c2-alex", "agr-c2", wallets["Alex"], "0xSIG_ALEX_C2_" + "7" * 41, True, "2024-02-05T10:00:00Z"),
    ("sig-c2-sarah", "agr-c2", wallets["Sarah"], "0xSIG_SARAH_WITNESS_C2_" + "8" * 33, True, "2024-02-05T10:30:00Z"),
]

for s in sig_data:
    insert_or_ignore("agreement_signatures", {
        "id": s[0],
        "agreement_id": s[1],
        "signer_address": s[2],
        "signature": s[3],
        "verified": 1 if s[4] else 0,
        "signed_at": s[5]
    })

# =============================================================================
# 5. MORE MILESTONES
# =============================================================================
print("=== Adding Milestones ===")
new_milestones = [
    # For Marcus (council_member_id=1) - additional milestones
    (11, "agr-f1", 1, "API Gateway & Module System", "Design and implement the RESTful API gateway with 9 AI module endpoints, authentication, and rate limiting", 3, "2025-01-01", 300000.0, "completed", "2025-01-15 09:00:00"),
    (12, "agr-f1", 1, "Mission Control Dashboard", "Build the Mission Control real-time dashboard with WebSocket integration, agent monitoring, and session management", 4, "2025-03-01", 400000.0, "completed", "2025-02-28 17:00:00"),
    (13, "agr-f1", 1, "DeFi Protocol Integration", "Integrate SODA token with Raydium DEX, implement liquidity pool smart contracts, and deploy staking mechanisms", 5, "2026-06-01", 500000.0, "in_progress", None),
    (14, "agr-f1", 1, "Cross-Chain Bridge Deployment", "Deploy Wormhole bridge for SODA token between Solana and Ethereum networks with full audit", 6, "2026-09-01", 600000.0, "pending", None),

    # For Sarah (council_member_id=2)
    (15, "agr-f2", 2, "Seed Round Fundraising", "Close $2M seed round with strategic investors including Coca-Cola Ventures, Draper Associates, and Solana Ventures", 3, "2025-06-01", 500000.0, "completed", "2025-05-20 14:00:00"),
    (16, "agr-f2", 2, "Strategic Partnership Pipeline", "Establish partnerships with 5 major beverage brands for tokenized loyalty programs", 4, "2026-03-01", 400000.0, "in_progress", None),
    (17, "agr-f2", 2, "Series A Preparation", "Prepare Series A materials, financial models, and investor deck for $10M raise", 5, "2026-09-01", 600000.0, "pending", None),

    # For James (council_member_id=3)
    (18, "agr-f3", 3, "Genesis NFT Art Direction", "Complete art direction for 10,000-piece Genesis NFT collection with 200 unique traits and rarity system", 3, "2025-06-01", 300000.0, "completed", "2025-05-15 11:00:00"),
    (19, "agr-f3", 3, "Brand Identity System v2", "Redesign full brand identity including logo system, typography, color palette, and motion design language", 4, "2026-03-01", 250000.0, "in_progress", None),
    (20, "agr-f3", 3, "Metaverse Experience Design", "Design immersive metaverse experience for SodaWorld virtual headquarters and event spaces", 5, "2026-09-01", 400000.0, "pending", None),

    # For Lisa (council_member_id=4)
    (21, "agr-a1", 4, "DAO Legal Framework", "Establish complete legal framework for SodaWorld DAO including Delaware LLC registration, operating agreement, and compliance procedures", 1, "2024-06-01", 500000.0, "completed", "2024-05-28 16:00:00"),
    (22, "agr-a1", 4, "Token Securities Analysis", "Complete Howey Test analysis and legal opinion on SODA token classification for SEC compliance", 2, "2024-12-01", 300000.0, "completed", "2024-11-15 10:00:00"),
    (23, "agr-a1", 4, "International Compliance Review", "Review and establish compliance framework for UK, EU (MiCA), and Singapore jurisdictions", 3, "2026-06-01", 400000.0, "in_progress", None),

    # For David (council_member_id=5)
    (24, "agr-a2", 5, "Tokenomics Design", "Design complete tokenomics model including distribution, vesting, inflation/deflation mechanics, and governance weight formulas", 1, "2024-06-01", 400000.0, "completed", "2024-05-30 12:00:00"),
    (25, "agr-a2", 5, "Smart Contract Architecture", "Design Solana program architecture for SODA token, governance, and treasury management smart contracts", 2, "2025-01-01", 350000.0, "completed", "2024-12-20 15:00:00"),
    (26, "agr-a2", 5, "Oracle Integration Advisory", "Advise on Chainlink oracle integration architecture and risk assessment for price feeds and VRF", 3, "2026-03-01", 250000.0, "in_progress", None),
]

for m in new_milestones:
    insert_or_ignore("milestones", {
        "id": m[0],
        "agreement_id": m[1],
        "council_member_id": m[2],
        "title": m[3],
        "description": m[4],
        "milestone_order": m[5],
        "target_date": m[6],
        "token_amount": m[7],
        "status": m[8],
        "completed_date": None,
        "verified_by": None,
        "completion_notes": None,
        "completed_at": m[9],
        "created_at": now,
        "updated_at": now
    })

# =============================================================================
# 6. MORE MARKETPLACE ITEMS
# =============================================================================
print("=== Adding Marketplace Items ===")
new_marketplace = [
    {
        "id": "mkt6", "seller_id": "user-james", "name": "SodaWorld OG Badge NFT",
        "type": "NFT", "price": 500, "description": "Limited edition OG Badge for the first 500 SodaWorld members. Grants permanent 1.2x voting multiplier and exclusive channel access. Non-transferable soul-bound token.",
        "image_url": "https://picsum.photos/seed/mkt6/400/400", "category": "Membership",
        "quantity": 500, "sold_count": 187, "status": "active",
        "creator_name": "James Wright", "creator_avatar_url": "https://picsum.photos/seed/james/100/100",
        "edition_current": 187, "edition_total": 500
    },
    {
        "id": "mkt7", "seller_id": "user-emma", "name": "Smart Contract Audit Service",
        "type": "Service", "price": 15000, "description": "Professional smart contract audit service by SodaWorld core dev Emma Rodriguez. Includes line-by-line code review, vulnerability assessment, gas optimization recommendations, and detailed audit report. Turnaround: 5 business days.",
        "image_url": "https://picsum.photos/seed/mkt7/400/400", "category": "Services",
        "quantity": 10, "sold_count": 3, "status": "active",
        "creator_name": "Emma Rodriguez", "creator_avatar_url": "https://picsum.photos/seed/emma/100/100",
        "edition_current": None, "edition_total": None
    },
    {
        "id": "mkt8", "seller_id": "user-alex", "name": "SodaWorld Merch Box",
        "type": "Physical", "price": 2500, "description": "Premium merchandise box: embroidered SodaWorld hoodie, enamel pin set, holographic sticker pack, branded water bottle, and exclusive trading cards. Ships worldwide.",
        "image_url": "https://picsum.photos/seed/mkt8/400/400", "category": "Merchandise",
        "quantity": 200, "sold_count": 89, "status": "active",
        "creator_name": "Alex Thompson", "creator_avatar_url": "https://picsum.photos/seed/alex/100/100",
        "edition_current": None, "edition_total": None
    },
    {
        "id": "mkt9", "seller_id": "user-david", "name": "Blockchain Advisory Session",
        "type": "Service", "price": 5000, "description": "1-hour advisory session with David Kumar covering tokenomics design, smart contract architecture, DeFi integration strategy, or blockchain technology selection. Includes follow-up document.",
        "image_url": "https://picsum.photos/seed/mkt9/400/400", "category": "Services",
        "quantity": 20, "sold_count": 7, "status": "active",
        "creator_name": "David Kumar", "creator_avatar_url": "https://picsum.photos/seed/david/100/100",
        "edition_current": None, "edition_total": None
    },
    {
        "id": "mkt10", "seller_id": "user-lisa", "name": "DAO Legal Template Pack",
        "type": "Template", "price": 8000, "description": "Comprehensive legal template pack for DAOs: operating agreement, contributor agreements, NDA, IP assignment, token grant agreement, advisor agreement, and investor SAFE. Customizable for US, UK, and Singapore jurisdictions.",
        "image_url": "https://picsum.photos/seed/mkt10/400/400", "category": "Templates",
        "quantity": 50, "sold_count": 22, "status": "active",
        "creator_name": "Lisa Park", "creator_avatar_url": "https://picsum.photos/seed/lisa/100/100",
        "edition_current": None, "edition_total": None
    },
    {
        "id": "mkt11", "seller_id": "system", "name": "SodaWorld Diamond Pass",
        "type": "NFT", "price": 50000, "description": "The ultimate SodaWorld membership. Lifetime access to all events, 2x voting power, quarterly strategy calls with founders, annual retreat invite, and exclusive product previews. Only 100 will ever exist.",
        "image_url": "https://picsum.photos/seed/mkt11/400/400", "category": "Membership",
        "quantity": 100, "sold_count": 12, "status": "active",
        "creator_name": "SodaDAO", "creator_avatar_url": "https://picsum.photos/seed/sodadao/100/100",
        "edition_current": 12, "edition_total": 100
    },
    {
        "id": "mkt12", "seller_id": "system", "name": "Fizzy Founders Art Series",
        "type": "NFT", "price": 3000, "description": "Hand-drawn digital art series featuring the 9 founding members as animated soda bottle characters. Each piece is 1/1 unique with custom animations. Proceeds go to the community treasury.",
        "image_url": "https://picsum.photos/seed/mkt12/400/400", "category": "Collectibles",
        "quantity": 9, "sold_count": 9, "status": "sold_out",
        "creator_name": "James Wright", "creator_avatar_url": "https://picsum.photos/seed/james/100/100",
        "edition_current": 9, "edition_total": 9
    },
    {
        "id": "mkt13", "seller_id": "user-marcus", "name": "SodaWorld API Pro License",
        "type": "License", "price": 10000, "description": "Annual pro license for the SodaWorld API. Includes 100k API calls/month, priority support, custom webhook integrations, and white-label dashboard. Ideal for beverage brands building on the SodaWorld platform.",
        "image_url": "https://picsum.photos/seed/mkt13/400/400", "category": "Software",
        "quantity": 999, "sold_count": 4, "status": "active",
        "creator_name": "Marcus Chen", "creator_avatar_url": "https://picsum.photos/seed/marcus/100/100",
        "edition_current": None, "edition_total": None
    },
]

for m in new_marketplace:
    insert_or_ignore("marketplace_items", m)

# =============================================================================
# 7. MORE KNOWLEDGE ITEMS
# =============================================================================
print("=== Adding Knowledge Items ===")
new_knowledge = [
    ("ki-11", "1", "treasury", "financial", "Q4 2025 Financial Summary",
     "Revenue: 450,000 SODA from marketplace fees. Expenses: 280,000 SODA (development bounties 120k, marketing 80k, legal 50k, infrastructure 30k). Net: +170,000 SODA. Treasury balance grew 18% QoQ.",
     "system", 0.98, "finance,quarterly,report"),
    ("ki-12", "1", "governance", "decision", "Coca-Cola Partnership Approved",
     "Strategic partnership with Coca-Cola Ventures approved by council with 91% approval. $500k investment secured. Pilot program to launch tokenized loyalty for 3 Coca-Cola brands in Q2 2026. Legal review completed by Lisa Park.",
     "system", 0.99, "partnership,coca-cola,governance"),
    ("ki-13", "1", "legal", "compliance", "SEC Token Classification - Safe Harbor",
     "SODA token classified as utility token under SEC guidance. Legal opinion by external counsel confirms no security classification under Howey Test. Token provides governance rights and platform access, not investment returns. Annual review scheduled.",
     "user-lisa", 0.95, "legal,sec,compliance,token"),
    ("ki-14", "1", "coach", "risk", "Key Person Dependency Risk",
     "Analysis shows high dependency on Marcus Chen (CTO) for technical decisions. Mitigation: Hire VP of Engineering (proposal p7 in voting), document architecture decisions, cross-train Emma Rodriguez on infrastructure. Risk level: Medium.",
     "system", 0.85, "risk,team,dependency"),
    ("ki-15", "1", "product", "roadmap", "2026 Product Roadmap",
     "Q1: Launch SDK + Developer Portal. Q2: DeFi integrations (Raydium, Marinade). Q3: Cross-chain bridge (Wormhole) + Mobile app beta. Q4: Metaverse experience + AI governance automation. Key metric: 1000 active developers by Q4.",
     "user-marcus", 0.92, "roadmap,product,2026"),
    ("ki-16", "1", "community", "engagement", "Community Growth Metrics",
     "Discord: 12,847 members (up 34% MoM). Twitter: 45,200 followers (up 22% MoM). GitHub: 892 stars, 234 forks, 67 contributors. Weekly active governance participants: 156. Bubble backers: 275 across 6 active bubbles.",
     "user-alex", 0.97, "community,metrics,growth"),
    ("ki-17", "1", "treasury", "policy", "Multi-Sig Treasury Policy Update",
     "Treasury policy updated: Transactions under 5,000 SODA require 1 of 3 signer approval. Transactions 5,000-50,000 SODA require 2 of 3. Transactions over 50,000 SODA require full council vote. Emergency transactions require all 3 signers plus 24-hour timelock.",
     "user-sarah", 0.99, "treasury,policy,multisig"),
    ("ki-18", "1", "legal", "agreement", "Contributor Agreement Best Practices",
     "All contributor agreements must include: 1) IP assignment clause, 2) Confidentiality obligations, 3) Token vesting schedule with cliff, 4) Termination conditions, 5) Dispute resolution via arbitration, 6) Non-compete (founders only). Templates available in marketplace (mkt10).",
     "user-lisa", 0.96, "legal,agreements,best-practices"),
    ("ki-19", "1", "governance", "process", "Proposal Lifecycle Documentation",
     "Proposal lifecycle: Draft (informal discussion) -> Pending (formal submission, 3-day review) -> Active (voting period, 7 days) -> Passed/Failed (results). Quorum: 50% of voting power. Approval: 50% for standard, 60% for treasury, 75% for constitutional amendments.",
     "user-sarah", 0.99, "governance,process,proposals"),
    ("ki-20", "1", "product", "technical", "Architecture Decision: Solana Over Ethereum",
     "Decision rationale for choosing Solana: 1) Sub-second finality for governance votes, 2) <$0.01 transaction costs for micro-transactions, 3) Growing DeFi ecosystem (Raydium, Marinade, Solend), 4) Rust-based development aligns with team skills. Trade-off: Smaller ecosystem than Ethereum, mitigated by Wormhole bridge plan.",
     "user-marcus", 0.94, "architecture,solana,technical"),
    ("ki-21", "1", "coach", "strategy", "Competitive Landscape Analysis",
     "Direct competitors: FriendsWithBenefits (social DAO), PleasrDAO (collecting), MakerDAO (DeFi governance). SodaWorld differentiator: Vertical focus on beverage industry + AI-augmented governance modules. Indirect: Shopify (e-commerce), Starbucks Odyssey (loyalty). Our moat: First-mover in beverage-industry DAO tooling.",
     "system", 0.88, "strategy,competition,analysis"),
    ("ki-22", "1", "treasury", "audit", "Smart Contract Audit Results - Phase 1",
     "CertiK audit of SODA token contract completed. Results: 0 critical, 1 major (reentrancy guard missing in claim function - fixed), 3 minor (gas optimizations), 5 informational. Overall score: 94/100. Full audit report published on-chain. Phase 2 audit for governance contracts scheduled Q2 2026.",
     "system", 0.97, "audit,security,smart-contract"),
    ("ki-23", "1", "community", "culture", "SodaWorld Community Values",
     "Core values established by founding council: 1) Transparency - all decisions on-chain, 2) Inclusivity - low barrier to participation, 3) Innovation - embrace AI and emerging tech, 4) Sustainability - long-term thinking over short-term gains, 5) Fun - we are a soda company after all. Values embedded in all community guidelines and contributor agreements.",
     "user-alex", 0.95, "community,values,culture"),
    ("ki-24", "1", "governance", "analytics", "Voter Participation Trends",
     "Average voter participation across 10 proposals: 72% of eligible voting power. Highest participation: Coca-Cola Partnership (p4) at 96%. Lowest: Token Burn (p10) at 65%. Founder participation: 100%. Advisor participation: 85%. Contributor/Firstborn participation: 55%. Recommendation: Implement vote delegation to boost participation.",
     "system", 0.93, "governance,analytics,voting"),
    ("ki-25", "1", "product", "integration", "Chainlink Oracle Integration Status",
     "Oracle integration approved (proposal p2). Implementation status: Price feed contract deployed on devnet. VRF integration for NFT minting randomness - 70% complete. Keeper automation for vesting unlocks - planned for Q2. Estimated mainnet deployment: March 2026.",
     "user-emma", 0.91, "integration,chainlink,oracle"),
]

for k in new_knowledge:
    insert_or_ignore("knowledge_items", {
        "id": k[0], "dao_id": k[1], "module_id": k[2], "category": k[3],
        "title": k[4], "content": k[5], "source": k[6], "confidence": k[7],
        "tags": k[8], "embedding_vector": None, "created_by": k[6],
        "expires_at": None, "created_at": now, "updated_at": now
    })

# =============================================================================
# 8. MORE BOUNTIES
# =============================================================================
print("=== Adding Bounties ===")
new_bounties = [
    ("b-5", "1", "Build Cross-Chain Bridge UI", "Design and implement the frontend interface for the Wormhole bridge integration. Must support SODA token transfers between Solana and Ethereum. Include transaction status tracking, fee estimation, and wallet connection for both chains.", 12000.0, "SODA", "open", "user-marcus", None, "2026-05-01", "Frontend,Smart contract integration,Testing", "frontend,bridge,cross-chain"),
    ("b-6", "1", "Create Video Tutorial Series", "Produce a 10-part video tutorial series covering SodaWorld DAO fundamentals: wallet setup, token acquisition, governance participation, bubble creation, marketplace usage. Each video 5-10 minutes with professional editing.", 8000.0, "SODA", "open", "user-alex", None, "2026-04-15", "10 videos,Thumbnails,Transcripts", "marketing,content,video"),
    ("b-7", "1", "Mobile App UI/UX Design", "Complete UI/UX design for the SodaWorld mobile app (iOS & Android). Includes governance voting, treasury dashboard, marketplace browsing, and push notifications. Deliver Figma files with design system, 40+ screens, and interactive prototype.", 15000.0, "SODA", "claimed", "user-james", "user-james", "2026-04-01", "Figma files,Design system,Prototype", "design,mobile,ux"),
    ("b-8", "1", "Implement Vote Delegation System", "Build a Solana program for vote delegation. Token holders can delegate voting power to trusted representatives without transferring tokens. Must support partial delegation, revocation, and delegation chains (max depth 3).", 20000.0, "SODA", "open", "user-marcus", None, "2026-06-01", "Solana program,Tests,Documentation", "smart-contract,governance,delegation"),
    ("b-9", "1", "Write API Documentation", "Create comprehensive API documentation for all 38 DAO backend endpoints. Include request/response examples, authentication guide, rate limiting info, error codes, and SDK usage examples in TypeScript and Python.", 6000.0, "SODA", "claimed", "user-marcus", "user-emma", "2026-03-15", "API docs,Examples,SDK guide", "documentation,api,developer"),
    ("b-10", "1", "Community Translation Program", "Translate SodaWorld documentation, UI strings, and marketing materials into Spanish, Portuguese, Japanese, Korean, and Mandarin. Each language package includes whitepaper, website copy, app strings, and community guidelines.", 10000.0, "SODA", "open", "user-alex", None, "2026-05-01", "5 language packs,QA review", "community,translation,i18n"),
    ("b-11", "1", "Discord Bot Development", "Build a custom Discord bot for SodaWorld: governance notifications, token balance queries, proposal alerts, bubble updates, reputation tracking, and automated role assignment based on token holdings. Must integrate with SodaWorld API.", 7000.0, "SODA", "completed", "user-alex", "user-noah", "2026-02-01", "Bot code,Documentation,Deployment guide", "development,discord,bot"),
    ("b-12", "1", "Tokenomics Simulation Model", "Build a Monte Carlo simulation model for SODA tokenomics. Model token supply/demand dynamics, vesting unlock impacts, liquidity pool depths, and governance participation under various market scenarios. Deliver Jupyter notebook with interactive visualizations.", 9000.0, "SODA", "open", "user-david", None, "2026-04-01", "Jupyter notebook,Report,Presentation", "tokenomics,analytics,simulation"),
]

for b in new_bounties:
    insert_or_ignore("bounties", {
        "id": b[0], "dao_id": b[1], "title": b[2], "description": b[3],
        "reward_amount": b[4], "reward_token": b[5], "status": b[6],
        "created_by": b[7], "claimed_by": b[8], "deadline": b[9],
        "deliverables": b[10], "tags": b[11], "created_at": now, "updated_at": now
    })

# =============================================================================
# 9. MORE TREASURY TRANSACTIONS
# =============================================================================
print("=== Adding Treasury Transactions ===")
new_treasury = [
    ("tx-006", "0xEmmaAddress", "Emma Rodriguez", 12000.0, "Smart contract development bounty payment - Q4 2025", "Executed", "2025-11-15T00:00:00Z", "2025-11-16T00:00:00Z"),
    ("tx-007", "0xAlexAddress", "Alex Thompson", 8000.0, "Community management monthly compensation - December 2025", "Executed", "2025-12-01T00:00:00Z", "2025-12-02T00:00:00Z"),
    ("tx-008", "0xLisaAddress", "Lisa Park", 15000.0, "Legal counsel retainer - Q1 2026", "Executed", "2026-01-05T00:00:00Z", "2026-01-06T00:00:00Z"),
    ("tx-009", "0xDavidAddress", "David Kumar", 10000.0, "Blockchain advisory services - January 2026", "Executed", "2026-01-15T00:00:00Z", "2026-01-16T00:00:00Z"),
    ("tx-010", "0xCertiKAddress", "CertiK", 35000.0, "Smart contract security audit - SODA token contract", "Executed", "2026-01-20T00:00:00Z", "2026-01-21T00:00:00Z"),
    ("tx-011", "0xETHDenverAddress", "ETHDenver 2026", 20000.0, "Gold sponsor package - ETHDenver 2026 conference", "Executed", "2026-01-25T00:00:00Z", "2026-01-26T00:00:00Z"),
    ("tx-012", "0xAWSAddress", "Amazon Web Services", 5500.0, "Cloud infrastructure - January 2026 (API servers, databases, CDN)", "Executed", "2026-02-01T00:00:00Z", "2026-02-02T00:00:00Z"),
    ("tx-013", "0xNoahAddress", "Noah Davis", 7000.0, "Discord bot development bounty (b-11) - completed", "Executed", "2026-02-05T00:00:00Z", "2026-02-06T00:00:00Z"),
    ("tx-014", "0xMarketingMultisig", "Marketing Guild", 45000.0, "Q1 2026 marketing budget - Phase 1 (social media campaigns)", "Executed", "2026-02-08T00:00:00Z", "2026-02-09T00:00:00Z"),
    ("tx-015", "0xJamesAddress", "James Wright", 18000.0, "Genesis NFT art direction milestone completion", "Executed", "2026-02-10T00:00:00Z", "2026-02-11T00:00:00Z"),
    ("tx-016", "0xEmmaAddress", "Emma Rodriguez", 6000.0, "API documentation bounty (b-9) - 50% milestone payment", "Pending", "2026-02-12T00:00:00Z", None),
    ("tx-017", "0xCocaColaVentures", "Coca-Cola Ventures", -500000.0, "Strategic investment received - partnership agreement", "Executed", "2026-02-01T00:00:00Z", "2026-02-02T00:00:00Z"),
    ("tx-018", "0xLiquidityPool", "Raydium SODA/USDC Pool", 100000.0, "Initial liquidity provision for SODA/USDC trading pair", "Pending", "2026-02-13T00:00:00Z", None),
    ("tx-019", "0xBugBountyAddress", "HackerOne", 25000.0, "Bug bounty program funding - Q1 2026", "Executed", "2026-02-05T00:00:00Z", "2026-02-06T00:00:00Z"),
    ("tx-020", "0xAWSAddress", "Amazon Web Services", 5500.0, "Cloud infrastructure - February 2026", "Pending", "2026-02-14T00:00:00Z", None),
]

for t in new_treasury:
    insert_or_ignore("treasury_transactions", {
        "id": t[0], "recipient": t[1], "recipientName": t[2], "amount": t[3],
        "memo": t[4], "status": t[5], "dateInitiated": t[6], "dateExecuted": t[7],
        "created_at": now, "updated_at": now
    })

# =============================================================================
# 10. TREASURY APPROVALS for new transactions
# =============================================================================
print("=== Adding Treasury Approvals ===")
approval_data = [
    ("tx-006", "0xAliceAddress"),
    ("tx-006", "0xBobAddress"),
    ("tx-007", "0xAliceAddress"),
    ("tx-007", "0xCharlieAddress"),
    ("tx-008", "0xAliceAddress"),
    ("tx-008", "0xBobAddress"),
    ("tx-009", "0xBobAddress"),
    ("tx-009", "0xCharlieAddress"),
    ("tx-010", "0xAliceAddress"),
    ("tx-010", "0xBobAddress"),
    ("tx-010", "0xCharlieAddress"),
    ("tx-011", "0xAliceAddress"),
    ("tx-011", "0xBobAddress"),
    ("tx-012", "0xAliceAddress"),
    ("tx-012", "0xCharlieAddress"),
    ("tx-013", "0xAliceAddress"),
    ("tx-013", "0xBobAddress"),
    ("tx-014", "0xAliceAddress"),
    ("tx-014", "0xBobAddress"),
    ("tx-014", "0xCharlieAddress"),
    ("tx-015", "0xBobAddress"),
    ("tx-015", "0xCharlieAddress"),
    ("tx-017", "0xAliceAddress"),
    ("tx-017", "0xBobAddress"),
    ("tx-017", "0xCharlieAddress"),
    ("tx-019", "0xAliceAddress"),
    ("tx-019", "0xBobAddress"),
]

for a in approval_data:
    insert_or_ignore("treasury_approvals", {
        "transaction_id": a[0],
        "signer_address": a[1],
        "created_at": now
    })

# =============================================================================
# 11. USER BALANCES
# =============================================================================
print("=== Adding User Balances ===")
balance_data = [
    ("user-marcus", 4000000, 950),
    ("user-sarah", 4000000, 920),
    ("user-james", 3000000, 880),
    ("user-lisa", 2000000, 850),
    ("user-david", 1500000, 820),
    ("user-emma", 1000000, 780),
    ("user-alex", 500000, 750),
    ("user-mia", 500000, 700),
    ("user-noah", 250000, 680),
]

for b in balance_data:
    insert_or_ignore("user_balances", {
        "user_id": b[0],
        "soda_balance": b[1],
        "bubble_score": b[2],
        "created_at": now,
        "updated_at": now
    })

# =============================================================================
# 12. MORE BUBBLES (community projects)
# =============================================================================
print("=== Adding Bubbles ===")
new_bubbles = [
    {
        "id": "bubble-7", "name": "Craft Soda Exchange", "type": "Commerce",
        "status": "Active", "fundingProgress": 85, "sodaRaised": 42500,
        "backers": 67, "healthScore": 91,
        "team": json.dumps([{"name": "Maya Chen", "role": "Lead"}, {"name": "Jake Foster", "role": "Dev"}]),
        "treasury": json.dumps({"balance": 42500, "monthly_burn": 3200}),
        "roadmap": json.dumps([{"title": "MVP Launch", "status": "completed"}, {"title": "Payment Integration", "status": "in_progress"}, {"title": "Mobile App", "status": "planned"}]),
        "updates": json.dumps([{"title": "MVP Live! 200 craft sodas listed", "date": "2026-01-20"}, {"title": "Partnership with 5 craft soda makers", "date": "2026-02-05"}])
    },
    {
        "id": "bubble-8", "name": "SodaVerse Metaverse", "type": "Gaming",
        "status": "Active", "fundingProgress": 45, "sodaRaised": 22500,
        "backers": 134, "healthScore": 68,
        "team": json.dumps([{"name": "Ryan Park", "role": "Game Director"}, {"name": "Sofia Lee", "role": "3D Artist"}]),
        "treasury": json.dumps({"balance": 22500, "monthly_burn": 8000}),
        "roadmap": json.dumps([{"title": "Concept Art", "status": "completed"}, {"title": "Prototype", "status": "in_progress"}, {"title": "Alpha Launch", "status": "planned"}]),
        "updates": json.dumps([{"title": "First gameplay footage revealed", "date": "2026-02-01"}, {"title": "Unity SDK integration complete", "date": "2026-02-10"}])
    },
    {
        "id": "bubble-9", "name": "Soda Science Lab", "type": "Education",
        "status": "Active", "fundingProgress": 70, "sodaRaised": 14000,
        "backers": 45, "healthScore": 82,
        "team": json.dumps([{"name": "Dr. Nina Patel", "role": "Lead Scientist"}, {"name": "Tom Baker", "role": "Content Creator"}]),
        "treasury": json.dumps({"balance": 14000, "monthly_burn": 2000}),
        "roadmap": json.dumps([{"title": "Course Curriculum", "status": "completed"}, {"title": "Video Production", "status": "in_progress"}, {"title": "Certification Program", "status": "planned"}]),
        "updates": json.dumps([{"title": "First 5 courses published", "date": "2026-01-28"}, {"title": "100 students enrolled", "date": "2026-02-08"}])
    },
    {
        "id": "bubble-10", "name": "SodaWorld Charity Fund", "type": "Social Impact",
        "status": "Active", "fundingProgress": 95, "sodaRaised": 47500,
        "backers": 203, "healthScore": 95,
        "team": json.dumps([{"name": "Grace Kim", "role": "Director"}, {"name": "Omar Hassan", "role": "Operations"}]),
        "treasury": json.dumps({"balance": 47500, "monthly_burn": 5000}),
        "roadmap": json.dumps([{"title": "Clean Water Initiative", "status": "completed"}, {"title": "School Partnership Program", "status": "in_progress"}, {"title": "Global Expansion", "status": "planned"}]),
        "updates": json.dumps([{"title": "3 clean water wells funded in Kenya", "date": "2026-01-15"}, {"title": "Partnership with UNICEF announced", "date": "2026-02-12"}])
    },
]

for b in new_bubbles:
    insert_or_ignore("bubbles", {
        "id": b["id"], "name": b["name"], "type": b["type"],
        "status": b["status"], "fundingProgress": b["fundingProgress"],
        "sodaRaised": b["sodaRaised"], "backers": b["backers"],
        "healthScore": b["healthScore"], "team": b["team"],
        "treasury": b["treasury"], "roadmap": b["roadmap"],
        "updates": b["updates"], "created_at": now, "updated_at": now
    })

# =============================================================================
# 13. ADMIN LOGS (realistic activity)
# =============================================================================
print("=== Adding Admin Logs ===")
admin_logs = [
    (str(uuid.uuid4()), "proposal_created", json.dumps({"proposal_id": "p3", "title": "Q1 Marketing Budget Allocation", "author": "Alex Thompson"}), "100.73.133.3", "Mozilla/5.0", None, 1, "2026-02-10T08:00:00Z"),
    (str(uuid.uuid4()), "proposal_created", json.dumps({"proposal_id": "p4", "title": "Partnership with Coca-Cola Ventures", "author": "Sarah Williams"}), "100.73.133.3", "Mozilla/5.0", None, 1, "2026-01-25T09:00:00Z"),
    (str(uuid.uuid4()), "proposal_passed", json.dumps({"proposal_id": "p4", "votes_for": 3200000, "votes_against": 100000}), "100.73.133.3", "system", None, 1, "2026-02-01T00:00:00Z"),
    (str(uuid.uuid4()), "agreement_signed", json.dumps({"agreement_id": "agr-f1", "signer": "Marcus Chen", "type": "founder"}), "100.73.133.3", "Mozilla/5.0", None, 1, "2024-01-15T10:00:00Z"),
    (str(uuid.uuid4()), "treasury_transfer", json.dumps({"tx_id": "tx-010", "amount": 35000, "recipient": "CertiK", "memo": "Security audit"}), "100.73.133.3", "system", None, 1, "2026-01-20T00:00:00Z"),
    (str(uuid.uuid4()), "bounty_completed", json.dumps({"bounty_id": "b-11", "claimed_by": "Noah Davis", "reward": 7000}), "100.73.133.3", "system", None, 1, "2026-02-01T00:00:00Z"),
    (str(uuid.uuid4()), "member_joined", json.dumps({"member": "Mia Johnson", "role": "firstborn", "token_allocation": 500000}), "100.73.133.3", "Mozilla/5.0", None, 1, "2024-02-10T10:00:00Z"),
    (str(uuid.uuid4()), "proposal_failed", json.dumps({"proposal_id": "p10", "title": "Annual Token Burn Proposal", "votes_for": 900000, "votes_against": 2100000}), "100.73.133.3", "system", None, 1, "2026-02-08T00:00:00Z"),
    (str(uuid.uuid4()), "login_success", json.dumps({"ip": "100.73.133.3", "userAgent": "Mozilla/5.0 Chrome/121"}), "100.73.133.3", "Mozilla/5.0 Chrome/121", "session-marcus-001", 1, "2026-02-14T08:00:00Z"),
    (str(uuid.uuid4()), "login_success", json.dumps({"ip": "100.73.133.4", "userAgent": "Mozilla/5.0 Safari/17"}), "100.73.133.4", "Mozilla/5.0 Safari/17", "session-sarah-001", 1, "2026-02-14T08:30:00Z"),
    (str(uuid.uuid4()), "sdk_released", json.dumps({"version": "1.0.0", "license": "MIT", "repo": "github.com/sodaworld/sdk"}), "100.73.133.3", "system", None, 1, "2026-02-05T00:00:00Z"),
    (str(uuid.uuid4()), "audit_completed", json.dumps({"auditor": "CertiK", "score": 94, "critical": 0, "major": 1, "minor": 3}), "100.73.133.3", "system", None, 1, "2026-01-25T00:00:00Z"),
]

for a in admin_logs:
    insert_or_ignore("admin_logs", {
        "id": a[0], "action": a[1], "details": a[2], "ip_address": a[3],
        "user_agent": a[4], "session_id": a[5], "success": a[6], "timestamp": a[7]
    })

# =============================================================================
# COMMIT AND REPORT
# =============================================================================
db.commit()

print("\n" + "=" * 60)
print("SODAWORLD DAO DATABASE POPULATION COMPLETE")
print("=" * 60)

total = 0
for table, count in sorted(counts.items()):
    print(f"  {table}: {count} rows added")
    total += count
print(f"\n  TOTAL: {total} rows added")

# Verification counts
print("\n=== VERIFICATION COUNTS ===")
for t in ['proposals', 'proposal_votes', 'votes', 'agreement_signatures', 'milestones', 'marketplace_items', 'knowledge_items', 'bounties', 'treasury_transactions', 'treasury_approvals', 'bubbles', 'user_balances', 'admin_logs']:
    cur.execute(f"SELECT COUNT(*) FROM {t}")
    cnt = cur.fetchone()[0]
    print(f"  {t}: {cnt} total rows")

db.close()
print("\nDONE_POPULATE")
'''

b64 = base64.b64encode(inner_script.encode()).decode()

# The b64 string is very long, so we need to write it in chunks
# PowerShell has a command length limit, so we'll write the base64 to a file first
chunk_size = 8000
chunks = [b64[i:i+chunk_size] for i in range(0, len(b64), chunk_size)]

print(f"Script encoded to {len(b64)} base64 chars, splitting into {len(chunks)} chunks")

# Write chunks to a temp file on Machine #3
send_cmd("Set-Content -Path 'C:\\Users\\User\\populate_b64.txt' -Value '' -NoNewline")
time.sleep(1)

for i, chunk in enumerate(chunks):
    send_cmd(f"Add-Content -Path 'C:\\Users\\User\\populate_b64.txt' -Value '{chunk}' -NoNewline")
    time.sleep(0.5)
    if i % 5 == 0:
        print(f"  Sent chunk {i+1}/{len(chunks)}")

time.sleep(2)
print("All chunks sent, decoding and writing Python file...")

# Decode the base64 file to the Python script
send_cmd("$b64 = Get-Content 'C:\\Users\\User\\populate_b64.txt' -Raw; [IO.File]::WriteAllBytes('C:\\Users\\User\\populate_dao.py', [Convert]::FromBase64String($b64)); echo 'SCRIPT_WRITTEN'")
time.sleep(3)

buf = read_buffer(2000)
if "SCRIPT_WRITTEN" in buf:
    print("Script written successfully!")
else:
    print("WARNING: Script write status unclear")
    print(buf[-500:])

# Execute the script
print("\nExecuting population script...")
send_cmd("python C:\\Users\\User\\populate_dao.py")
time.sleep(15)

output = read_buffer(15000)
print(output)
