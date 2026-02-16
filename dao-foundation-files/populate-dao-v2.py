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
from datetime import datetime

DB_PATH = r'C:\Users\User\Documents\GitHub\DAOV1\backend\mentor_chats.db'
db = sqlite3.connect(DB_PATH)
db.execute("PRAGMA journal_mode=WAL")
cur = db.cursor()
now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
counts = {}

def ac(t, n):
    counts[t] = counts.get(t, 0) + n

def ii(table, row):
    cols = list(row.keys())
    ph = ','.join(['?' for _ in cols])
    sql = f"INSERT OR IGNORE INTO {table} ({','.join(cols)}) VALUES ({ph})"
    cur.execute(sql, [row[c] for c in cols])
    if cur.rowcount > 0:
        ac(table, 1)

print("=== PROPOSALS ===")
props = [
    {"id":"p3","title":"Q1 Marketing Budget Allocation","description":"Allocate 200,000 SODA tokens for Q1 2026 marketing initiatives including influencer partnerships with top crypto YouTubers, Twitter Spaces campaigns, and sponsorship of ETHDenver 2026. Budget breakdown: Influencer partnerships (80k), social media ads (50k), conference sponsorships (40k), content creation (30k).","proposer":'{"name":"Alex Thompson","avatarUrl":"https://picsum.photos/seed/alex/100/100"}',"status":"Active","votesFor":1850000,"votesAgainst":320000,"votesAbstain":150000,"endDate":"5 days remaining","dao_id":None,"type":"treasury_spend","author_id":None,"voting_starts_at":"2026-02-10T00:00:00Z","voting_ends_at":"2026-02-19T00:00:00Z","quorum_required":0.5,"approval_threshold":0.6,"execution_payload":'{"action":"transfer","amount":200000,"token":"SODA"}',"result_summary":None},
    {"id":"p4","title":"Partnership with Coca-Cola Ventures","description":"Establish a strategic partnership with Coca-Cola Ventures to explore tokenized loyalty programs for beverage brands. The partnership includes a $500k investment, co-development of a Web3 loyalty SDK, and exclusive pilot program with 3 Coca-Cola brands.","proposer":'{"name":"Sarah Williams","avatarUrl":"https://picsum.photos/seed/sarah/100/100"}',"status":"Passed","votesFor":3200000,"votesAgainst":100000,"votesAbstain":200000,"endDate":"Ended 5 days ago","dao_id":None,"type":"custom","author_id":None,"voting_starts_at":"2026-01-25T00:00:00Z","voting_ends_at":"2026-02-01T00:00:00Z","quorum_required":0.5,"approval_threshold":0.6,"execution_payload":'{"action":"partnership","partner":"Coca-Cola Ventures"}',"result_summary":'{"votes_for":3200000,"votes_against":100000,"abstain":200000,"approved":true}'},
    {"id":"p5","title":"Launch Genesis NFT Collection","description":"Launch the SodaWorld Genesis NFT Collection - 10,000 unique beverage-themed NFTs on Solana. Each NFT grants governance voting multiplier (1.5x), exclusive Discord access, real-world soda brand discounts, and early access to all future launches.","proposer":'{"name":"James Wright","avatarUrl":"https://picsum.photos/seed/james/100/100"}',"status":"Active","votesFor":2100000,"votesAgainst":680000,"votesAbstain":90000,"endDate":"2 days remaining","dao_id":None,"type":"custom","author_id":None,"voting_starts_at":"2026-02-08T00:00:00Z","voting_ends_at":"2026-02-16T00:00:00Z","quorum_required":0.5,"approval_threshold":0.5,"execution_payload":'{"action":"nft_launch","collection_size":10000}',"result_summary":None},
    {"id":"p6","title":"Community Rewards Program v2","description":"Revamp the community rewards program with tiered benefits. Bronze (1k SODA), Silver (10k SODA), Gold (100k SODA), Diamond (1M SODA). Estimated annual cost: 500,000 SODA.","proposer":'{"name":"Alex Thompson","avatarUrl":"https://picsum.photos/seed/alex/100/100"}',"status":"Passed","votesFor":2900000,"votesAgainst":450000,"votesAbstain":50000,"endDate":"Ended 10 days ago","dao_id":None,"type":"parameter_change","author_id":None,"voting_starts_at":"2026-01-20T00:00:00Z","voting_ends_at":"2026-01-27T00:00:00Z","quorum_required":0.5,"approval_threshold":0.5,"execution_payload":'{"action":"rewards_update","tiers":["Bronze","Silver","Gold","Diamond"]}',"result_summary":'{"votes_for":2900000,"votes_against":450000,"abstain":50000,"approved":true}'},
    {"id":"p7","title":"Hire VP of Engineering","description":"Authorize hiring a VP of Engineering. Compensation: 150,000 USDC annual salary + 2,000,000 SODA tokens vesting over 4 years with 1-year cliff. The VP will oversee smart contract dev, API infrastructure, and front-end engineering.","proposer":'{"name":"Marcus Chen","avatarUrl":"https://picsum.photos/seed/marcus/100/100"}',"status":"Active","votesFor":1600000,"votesAgainst":900000,"votesAbstain":400000,"endDate":"4 days remaining","dao_id":None,"type":"treasury_spend","author_id":None,"voting_starts_at":"2026-02-09T00:00:00Z","voting_ends_at":"2026-02-18T00:00:00Z","quorum_required":0.5,"approval_threshold":0.6,"execution_payload":'{"action":"hire","role":"VP of Engineering","salary_usdc":150000}',"result_summary":None},
    {"id":"p8","title":"Open Source SDK Release","description":"Release the SodaWorld Developer SDK as open source under MIT license. Includes TypeScript/JS client library, Solana program interfaces, governance module SDK, treasury API wrappers, and example applications.","proposer":'{"name":"Emma Rodriguez","avatarUrl":"https://picsum.photos/seed/emma/100/100"}',"status":"Passed","votesFor":3400000,"votesAgainst":50000,"votesAbstain":100000,"endDate":"Ended 8 days ago","dao_id":None,"type":"custom","author_id":None,"voting_starts_at":"2026-01-28T00:00:00Z","voting_ends_at":"2026-02-04T00:00:00Z","quorum_required":0.5,"approval_threshold":0.5,"execution_payload":'{"action":"sdk_release","license":"MIT"}',"result_summary":'{"votes_for":3400000,"votes_against":50000,"abstain":100000,"approved":true}'},
    {"id":"p9","title":"DeFi Integration Roadmap","description":"Approve the DeFi integration roadmap for Q2-Q3 2026. Phase 1: SODA/USDC pool on Raydium. Phase 2: Marinade Finance staking. Phase 3: Solend lending. Phase 4: Wormhole cross-chain bridge. Budget: 3M SODA for liquidity incentives.","proposer":'{"name":"David Kumar","avatarUrl":"https://picsum.photos/seed/david/100/100"}',"status":"Pending","votesFor":0,"votesAgainst":0,"votesAbstain":0,"endDate":"Voting starts in 3 days","dao_id":None,"type":"parameter_change","author_id":None,"voting_starts_at":"2026-02-17T00:00:00Z","voting_ends_at":"2026-02-24T00:00:00Z","quorum_required":0.5,"approval_threshold":0.6,"execution_payload":'{"action":"defi_roadmap","phases":4}',"result_summary":None},
    {"id":"p10","title":"Annual Token Burn Proposal","description":"Implement an annual token burn mechanism. Burn 2% of total supply (200M tokens from unallocated reserve) on the anniversary of DAO formation. Creates deflationary pressure and rewards long-term holders.","proposer":'{"name":"David Kumar","avatarUrl":"https://picsum.photos/seed/david/100/100"}',"status":"Failed","votesFor":900000,"votesAgainst":2100000,"votesAbstain":300000,"endDate":"Ended 3 days ago","dao_id":None,"type":"parameter_change","author_id":None,"voting_starts_at":"2026-02-01T00:00:00Z","voting_ends_at":"2026-02-08T00:00:00Z","quorum_required":0.5,"approval_threshold":0.6,"execution_payload":'{"action":"token_burn","burn_pct":2}',"result_summary":'{"votes_for":900000,"votes_against":2100000,"abstain":300000,"approved":false}'},
]
for p in props:
    ii("proposals", p)

print("=== PROPOSAL VOTES ===")
w = {"Ma":"7xKXtg2CW87d97TXJSDpbD6jBHqNRf1S3wFTa7rBFBwi","Sa":"9xKXtg2CW87d97TXJSDpbD6jBHqNRf1S3wFTa7rBFBwj","Ja":"3xKXtg2CW87d97TXJSDpbD6jBHqNRf1S3wFTa7rBFBwk","Li":"0xLISA0004","Da":"0xDAVID0005","Em":"0xEMMA0006","Al":"0xALEX0007","Mi":"0xMIA0008","No":"0xNOAH0009"}
pvs = [
    ("pv-p1-1","p1",w["Ma"],"for",4000000,"2026-02-11T10:00:00Z"),
    ("pv-p1-2","p1",w["Sa"],"for",4000000,"2026-02-11T11:00:00Z"),
    ("pv-p1-3","p1",w["Ja"],"abstain",3000000,"2026-02-11T14:00:00Z"),
    ("pv-p1-4","p1",w["Li"],"against",2000000,"2026-02-12T09:00:00Z"),
    ("pv-p1-5","p1",w["Em"],"for",1000000,"2026-02-12T11:00:00Z"),
    ("pv-p2-1","p2",w["Ma"],"for",4000000,"2026-02-06T09:00:00Z"),
    ("pv-p2-2","p2",w["Sa"],"for",4000000,"2026-02-06T10:00:00Z"),
    ("pv-p2-3","p2",w["Ja"],"for",3000000,"2026-02-06T14:00:00Z"),
    ("pv-p2-4","p2",w["Da"],"for",1500000,"2026-02-07T08:00:00Z"),
    ("pv-p2-5","p2",w["Em"],"for",1000000,"2026-02-07T10:00:00Z"),
    ("pv-p2-6","p2",w["Al"],"for",500000,"2026-02-07T12:00:00Z"),
    ("pv-p2-7","p2",w["Li"],"abstain",2000000,"2026-02-07T15:00:00Z"),
    ("pv-p3-1","p3",w["Sa"],"for",4000000,"2026-02-10T09:00:00Z"),
    ("pv-p3-2","p3",w["Al"],"for",500000,"2026-02-10T10:00:00Z"),
    ("pv-p3-3","p3",w["Ma"],"for",4000000,"2026-02-10T14:00:00Z"),
    ("pv-p3-4","p3",w["Ja"],"for",3000000,"2026-02-11T08:00:00Z"),
    ("pv-p3-5","p3",w["Li"],"against",2000000,"2026-02-11T11:00:00Z"),
    ("pv-p3-6","p3",w["Mi"],"for",500000,"2026-02-12T09:00:00Z"),
    ("pv-p4-1","p4",w["Sa"],"for",4000000,"2026-01-26T09:00:00Z"),
    ("pv-p4-2","p4",w["Ma"],"for",4000000,"2026-01-26T10:00:00Z"),
    ("pv-p4-3","p4",w["Ja"],"for",3000000,"2026-01-26T14:00:00Z"),
    ("pv-p4-4","p4",w["Li"],"for",2000000,"2026-01-27T08:00:00Z"),
    ("pv-p4-5","p4",w["Da"],"for",1500000,"2026-01-27T10:00:00Z"),
    ("pv-p4-6","p4",w["Em"],"for",1000000,"2026-01-27T12:00:00Z"),
    ("pv-p4-7","p4",w["Al"],"for",500000,"2026-01-28T09:00:00Z"),
    ("pv-p4-8","p4",w["Mi"],"abstain",500000,"2026-01-28T10:00:00Z"),
    ("pv-p4-9","p4",w["No"],"abstain",250000,"2026-01-28T14:00:00Z"),
    ("pv-p5-1","p5",w["Ja"],"for",3000000,"2026-02-09T09:00:00Z"),
    ("pv-p5-2","p5",w["Sa"],"for",4000000,"2026-02-09T11:00:00Z"),
    ("pv-p5-3","p5",w["Ma"],"against",4000000,"2026-02-09T14:00:00Z"),
    ("pv-p5-4","p5",w["Da"],"against",1500000,"2026-02-10T08:00:00Z"),
    ("pv-p5-5","p5",w["Em"],"for",1000000,"2026-02-10T10:00:00Z"),
    ("pv-p5-6","p5",w["Mi"],"for",500000,"2026-02-10T14:00:00Z"),
    ("pv-p6-1","p6",w["Sa"],"for",4000000,"2026-01-21T09:00:00Z"),
    ("pv-p6-2","p6",w["Ma"],"for",4000000,"2026-01-21T10:00:00Z"),
    ("pv-p6-3","p6",w["Al"],"for",500000,"2026-01-21T14:00:00Z"),
    ("pv-p6-4","p6",w["Ja"],"for",3000000,"2026-01-22T08:00:00Z"),
    ("pv-p6-5","p6",w["Em"],"for",1000000,"2026-01-22T10:00:00Z"),
    ("pv-p6-6","p6",w["Da"],"against",1500000,"2026-01-22T12:00:00Z"),
    ("pv-p6-7","p6",w["Li"],"for",2000000,"2026-01-23T09:00:00Z"),
    ("pv-p7-1","p7",w["Ma"],"for",4000000,"2026-02-10T09:00:00Z"),
    ("pv-p7-2","p7",w["Sa"],"for",4000000,"2026-02-10T11:00:00Z"),
    ("pv-p7-3","p7",w["Li"],"against",2000000,"2026-02-10T14:00:00Z"),
    ("pv-p7-4","p7",w["Da"],"against",1500000,"2026-02-11T08:00:00Z"),
    ("pv-p7-5","p7",w["Em"],"for",1000000,"2026-02-11T10:00:00Z"),
    ("pv-p7-6","p7",w["Mi"],"abstain",500000,"2026-02-11T14:00:00Z"),
    ("pv-p7-7","p7",w["No"],"abstain",250000,"2026-02-12T09:00:00Z"),
    ("pv-p8-1","p8",w["Ma"],"for",4000000,"2026-01-29T09:00:00Z"),
    ("pv-p8-2","p8",w["Sa"],"for",4000000,"2026-01-29T10:00:00Z"),
    ("pv-p8-3","p8",w["Ja"],"for",3000000,"2026-01-29T14:00:00Z"),
    ("pv-p8-4","p8",w["Em"],"for",1000000,"2026-01-30T08:00:00Z"),
    ("pv-p8-5","p8",w["Da"],"for",1500000,"2026-01-30T10:00:00Z"),
    ("pv-p8-6","p8",w["Al"],"for",500000,"2026-01-30T12:00:00Z"),
    ("pv-p8-7","p8",w["Li"],"for",2000000,"2026-01-31T09:00:00Z"),
    ("pv-p8-8","p8",w["Mi"],"for",500000,"2026-01-31T10:00:00Z"),
    ("pv-p10-1","p10",w["Da"],"for",1500000,"2026-02-02T09:00:00Z"),
    ("pv-p10-2","p10",w["Ma"],"against",4000000,"2026-02-02T10:00:00Z"),
    ("pv-p10-3","p10",w["Sa"],"against",4000000,"2026-02-02T14:00:00Z"),
    ("pv-p10-4","p10",w["Ja"],"against",3000000,"2026-02-03T08:00:00Z"),
    ("pv-p10-5","p10",w["Li"],"for",2000000,"2026-02-03T10:00:00Z"),
    ("pv-p10-6","p10",w["Em"],"against",1000000,"2026-02-03T12:00:00Z"),
    ("pv-p10-7","p10",w["Mi"],"abstain",500000,"2026-02-04T09:00:00Z"),
    ("pv-p10-8","p10",w["No"],"abstain",250000,"2026-02-04T10:00:00Z"),
]
for v in pvs:
    ii("proposal_votes",{"id":v[0],"proposal_id":v[1],"voter_address":v[2],"vote_type":v[3],"voting_power":v[4],"voted_at":v[5]})

print("=== VOTES ===")
vts = [
    ("v-p2-ma","p2","user-marcus","yes",4.0,"Strong technical decision. Chainlink is battle-tested.","2026-02-05T12:00:00Z"),
    ("v-p2-sa","p2","user-sarah","yes",4.0,"Aligns with our product roadmap for price feeds.","2026-02-05T12:00:00Z"),
    ("v-p2-ja","p2","user-james","yes",3.0,"Enables dynamic pricing for NFT marketplace.","2026-02-05T12:00:00Z"),
    ("v-p2-da","p2","user-david","yes",1.5,"Essential infrastructure. I recommend Chainlink V2.","2026-02-06T09:00:00Z"),
    ("v-p2-em","p2","user-emma","yes",1.0,"Already prototyped the integration. Ready to ship.","2026-02-06T10:00:00Z"),
    ("v-p2-li","p2","user-lisa","abstain",2.0,"Need to review oracle service agreement terms.","2026-02-06T14:00:00Z"),
    ("v-p4-sa","p4","user-sarah","yes",4.0,"Transformative partnership. Due diligence complete.","2026-01-26T09:00:00Z"),
    ("v-p4-ma","p4","user-marcus","yes",4.0,"Technical integration is feasible. Great opportunity.","2026-01-26T10:00:00Z"),
    ("v-p4-ja","p4","user-james","yes",3.0,"Massive brand credibility boost for SodaWorld.","2026-01-26T14:00:00Z"),
    ("v-p4-li","p4","user-lisa","yes",2.0,"Legal review passed. Terms are favorable.","2026-01-27T08:00:00Z"),
    ("v-p4-da","p4","user-david","yes",1.5,"Smart money validation for our token.","2026-01-27T10:00:00Z"),
    ("v-p4-em","p4","user-emma","yes",1.0,"SDK integration with their systems is doable.","2026-01-27T12:00:00Z"),
    ("v-p4-al","p4","user-alex","yes",0.5,"Community is very excited about this.","2026-01-28T09:00:00Z"),
    ("v-p6-sa","p6","user-sarah","yes",4.0,"Community retention is critical at this stage.","2026-01-21T09:00:00Z"),
    ("v-p6-ma","p6","user-marcus","yes",4.0,"Gamification will drive engagement.","2026-01-21T10:00:00Z"),
    ("v-p6-al","p6","user-alex","yes",0.5,"Our community has been asking for this!","2026-01-21T14:00:00Z"),
    ("v-p6-da","p6","user-david","no",1.5,"Concerned about token inflation from rewards.","2026-01-22T12:00:00Z"),
    ("v-p8-ma","p8","user-marcus","yes",4.0,"Open source is the way. Will attract developers.","2026-01-29T09:00:00Z"),
    ("v-p8-sa","p8","user-sarah","yes",4.0,"Developer ecosystem is key to platform growth.","2026-01-29T10:00:00Z"),
    ("v-p8-em","p8","user-emma","yes",1.0,"I built this SDK. Excited to release it.","2026-01-30T08:00:00Z"),
    ("v-p8-da","p8","user-david","yes",1.5,"MIT license is the right choice for adoption.","2026-01-30T10:00:00Z"),
    ("v-p10-da","p10","user-david","yes",1.5,"Deflationary mechanism benefits long-term holders.","2026-02-02T09:00:00Z"),
    ("v-p10-ma","p10","user-marcus","no",4.0,"We need tokens for liquidity mining and partnerships.","2026-02-02T10:00:00Z"),
    ("v-p10-sa","p10","user-sarah","no",4.0,"Premature. Build utility first, not artificial scarcity.","2026-02-02T14:00:00Z"),
    ("v-p10-ja","p10","user-james","no",3.0,"Agree with Sarah. Focus on building value.","2026-02-03T08:00:00Z"),
    ("v-p10-li","p10","user-lisa","yes",2.0,"Token burn is standard practice in successful DAOs.","2026-02-03T10:00:00Z"),
    ("v-p10-em","p10","user-emma","no",1.0,"We need those tokens for developer bounties.","2026-02-03T12:00:00Z"),
]
for v in vts:
    ii("votes",{"id":v[0],"proposal_id":v[1],"user_id":v[2],"choice":v[3],"weight":v[4],"reason":v[5],"cast_at":v[6]})

print("=== AGREEMENT SIGNATURES ===")
sigs = [
    ("sig-f1-marcus","agr-f1",w["Ma"],"0xSIG_MARCUS_F1_aaaaaaaaaa",1,"2024-01-15T10:00:00Z"),
    ("sig-f1-sarah","agr-f1",w["Sa"],"0xSIG_SARAH_WITNESS_bbbbbbb",1,"2024-01-15T10:30:00Z"),
    ("sig-f2-sarah","agr-f2",w["Sa"],"0xSIG_SARAH_F2_ccccccccccc",1,"2024-01-15T11:00:00Z"),
    ("sig-f2-marcus","agr-f2",w["Ma"],"0xSIG_MARCUS_WITNESS_ddddd",1,"2024-01-15T11:30:00Z"),
    ("sig-f3-james","agr-f3",w["Ja"],"0xSIG_JAMES_F3_eeeeeeeeeee",1,"2024-01-20T09:00:00Z"),
    ("sig-f3-sarah","agr-f3",w["Sa"],"0xSIG_SARAH_WITNESS_F3_ffff",1,"2024-01-20T09:30:00Z"),
    ("sig-a1-lisa","agr-a1",w["Li"],"0xSIG_LISA_A1_111111111111",1,"2024-02-01T10:00:00Z"),
    ("sig-a1-sarah","agr-a1",w["Sa"],"0xSIG_SARAH_WITNESS_A1_222",1,"2024-02-01T10:30:00Z"),
    ("sig-a2-david","agr-a2",w["Da"],"0xSIG_DAVID_A2_33333333333",1,"2024-02-01T11:00:00Z"),
    ("sig-a2-sarah","agr-a2",w["Sa"],"0xSIG_SARAH_WITNESS_A2_444",1,"2024-02-01T11:30:00Z"),
    ("sig-c1-emma","agr-c1",w["Em"],"0xSIG_EMMA_C1_555555555555",1,"2024-02-05T09:00:00Z"),
    ("sig-c1-marcus","agr-c1",w["Ma"],"0xSIG_MARCUS_WITNESS_C1_6",1,"2024-02-05T09:30:00Z"),
    ("sig-c2-alex","agr-c2",w["Al"],"0xSIG_ALEX_C2_777777777777",1,"2024-02-05T10:00:00Z"),
    ("sig-c2-sarah","agr-c2",w["Sa"],"0xSIG_SARAH_WITNESS_C2_888",1,"2024-02-05T10:30:00Z"),
]
for s in sigs:
    ii("agreement_signatures",{"id":s[0],"agreement_id":s[1],"signer_address":s[2],"signature":s[3],"verified":s[4],"signed_at":s[5]})

print("=== MILESTONES ===")
ms = [
    (11,"agr-f1",1,"API Gateway and Module System","Design and implement the RESTful API gateway with 9 AI module endpoints, authentication, and rate limiting",3,"2025-01-01",300000.0,"completed","2025-01-15 09:00:00"),
    (12,"agr-f1",1,"Mission Control Dashboard","Build the Mission Control real-time dashboard with WebSocket integration, agent monitoring, and session management",4,"2025-03-01",400000.0,"completed","2025-02-28 17:00:00"),
    (13,"agr-f1",1,"DeFi Protocol Integration","Integrate SODA token with Raydium DEX, implement liquidity pool smart contracts, and deploy staking mechanisms",5,"2026-06-01",500000.0,"in_progress",None),
    (14,"agr-f1",1,"Cross-Chain Bridge Deployment","Deploy Wormhole bridge for SODA token between Solana and Ethereum networks with full audit",6,"2026-09-01",600000.0,"pending",None),
    (15,"agr-f2",2,"Seed Round Fundraising","Close $2M seed round with strategic investors including Coca-Cola Ventures, Draper Associates, and Solana Ventures",3,"2025-06-01",500000.0,"completed","2025-05-20 14:00:00"),
    (16,"agr-f2",2,"Strategic Partnership Pipeline","Establish partnerships with 5 major beverage brands for tokenized loyalty programs",4,"2026-03-01",400000.0,"in_progress",None),
    (17,"agr-f2",2,"Series A Preparation","Prepare Series A materials, financial models, and investor deck for $10M raise",5,"2026-09-01",600000.0,"pending",None),
    (18,"agr-f3",3,"Genesis NFT Art Direction","Complete art direction for 10,000-piece Genesis NFT collection with 200 unique traits and rarity system",3,"2025-06-01",300000.0,"completed","2025-05-15 11:00:00"),
    (19,"agr-f3",3,"Brand Identity System v2","Redesign full brand identity including logo system, typography, color palette, and motion design language",4,"2026-03-01",250000.0,"in_progress",None),
    (20,"agr-f3",3,"Metaverse Experience Design","Design immersive metaverse experience for SodaWorld virtual headquarters and event spaces",5,"2026-09-01",400000.0,"pending",None),
    (21,"agr-a1",4,"DAO Legal Framework","Establish complete legal framework for SodaWorld DAO including Delaware LLC registration and compliance",1,"2024-06-01",500000.0,"completed","2024-05-28 16:00:00"),
    (22,"agr-a1",4,"Token Securities Analysis","Complete Howey Test analysis and legal opinion on SODA token classification for SEC compliance",2,"2024-12-01",300000.0,"completed","2024-11-15 10:00:00"),
    (23,"agr-a1",4,"International Compliance Review","Review and establish compliance framework for UK, EU (MiCA), and Singapore jurisdictions",3,"2026-06-01",400000.0,"in_progress",None),
    (24,"agr-a2",5,"Tokenomics Design","Design complete tokenomics model including distribution, vesting, inflation/deflation mechanics, and governance weight",1,"2024-06-01",400000.0,"completed","2024-05-30 12:00:00"),
    (25,"agr-a2",5,"Smart Contract Architecture","Design Solana program architecture for SODA token, governance, and treasury management",2,"2025-01-01",350000.0,"completed","2024-12-20 15:00:00"),
    (26,"agr-a2",5,"Oracle Integration Advisory","Advise on Chainlink oracle integration architecture and risk assessment for price feeds and VRF",3,"2026-03-01",250000.0,"in_progress",None),
]
for m in ms:
    ii("milestones",{"id":m[0],"agreement_id":m[1],"council_member_id":m[2],"title":m[3],"description":m[4],"milestone_order":m[5],"target_date":m[6],"token_amount":m[7],"status":m[8],"completed_date":None,"verified_by":None,"completion_notes":None,"completed_at":m[9],"created_at":now,"updated_at":now})

print("=== MARKETPLACE ===")
mkts = [
    {"id":"mkt6","seller_id":"user-james","name":"SodaWorld OG Badge NFT","type":"NFT","price":500,"description":"Limited edition OG Badge for first 500 members. Grants permanent 1.2x voting multiplier and exclusive channel access.","image_url":"https://picsum.photos/seed/mkt6/400/400","category":"Membership","quantity":500,"sold_count":187,"status":"active","creator_name":"James Wright","creator_avatar_url":"https://picsum.photos/seed/james/100/100","edition_current":187,"edition_total":500,"created_at":"2025-10-23 10:38:00"},
    {"id":"mkt7","seller_id":"user-emma","name":"Smart Contract Audit Service","type":"Service","price":15000,"description":"Professional smart contract audit by Emma Rodriguez. Line-by-line review, vulnerability assessment, gas optimization, and detailed report. 5 business days.","image_url":"https://picsum.photos/seed/mkt7/400/400","category":"Services","quantity":10,"sold_count":3,"status":"active","creator_name":"Emma Rodriguez","creator_avatar_url":"https://picsum.photos/seed/emma/100/100","edition_current":None,"edition_total":None,"created_at":"2025-11-15 10:00:00"},
    {"id":"mkt8","seller_id":"user-alex","name":"SodaWorld Merch Box","type":"Physical","price":2500,"description":"Premium merchandise: embroidered hoodie, enamel pin set, holographic sticker pack, branded water bottle, and trading cards. Ships worldwide.","image_url":"https://picsum.photos/seed/mkt8/400/400","category":"Merchandise","quantity":200,"sold_count":89,"status":"active","creator_name":"Alex Thompson","creator_avatar_url":"https://picsum.photos/seed/alex/100/100","edition_current":None,"edition_total":None,"created_at":"2025-11-01 10:00:00"},
    {"id":"mkt9","seller_id":"user-david","name":"Blockchain Advisory Session","type":"Service","price":5000,"description":"1-hour advisory session with David Kumar covering tokenomics, smart contracts, DeFi strategy, or blockchain selection. Includes follow-up document.","image_url":"https://picsum.photos/seed/mkt9/400/400","category":"Services","quantity":20,"sold_count":7,"status":"active","creator_name":"David Kumar","creator_avatar_url":"https://picsum.photos/seed/david/100/100","edition_current":None,"edition_total":None,"created_at":"2025-12-01 10:00:00"},
    {"id":"mkt10","seller_id":"user-lisa","name":"DAO Legal Template Pack","type":"Template","price":8000,"description":"Comprehensive legal templates for DAOs: operating agreement, contributor agreements, NDA, IP assignment, token grant, advisor agreement, SAFE. US, UK, Singapore.","image_url":"https://picsum.photos/seed/mkt10/400/400","category":"Templates","quantity":50,"sold_count":22,"status":"active","creator_name":"Lisa Park","creator_avatar_url":"https://picsum.photos/seed/lisa/100/100","edition_current":None,"edition_total":None,"created_at":"2025-11-20 10:00:00"},
    {"id":"mkt11","seller_id":"system","name":"SodaWorld Diamond Pass","type":"NFT","price":50000,"description":"Ultimate membership. Lifetime access, 2x voting power, quarterly founder calls, annual retreat, exclusive previews. Only 100 ever.","image_url":"https://picsum.photos/seed/mkt11/400/400","category":"Membership","quantity":100,"sold_count":12,"status":"active","creator_name":"SodaDAO","creator_avatar_url":"https://picsum.photos/seed/sodadao/100/100","edition_current":12,"edition_total":100,"created_at":"2025-10-23 10:38:00"},
    {"id":"mkt12","seller_id":"system","name":"Fizzy Founders Art Series","type":"NFT","price":3000,"description":"Hand-drawn digital art: 9 founding members as animated soda bottle characters. Each piece 1/1 unique. Proceeds to community treasury.","image_url":"https://picsum.photos/seed/mkt12/400/400","category":"Collectibles","quantity":9,"sold_count":9,"status":"sold_out","creator_name":"James Wright","creator_avatar_url":"https://picsum.photos/seed/james/100/100","edition_current":9,"edition_total":9,"created_at":"2025-12-15 10:00:00"},
    {"id":"mkt13","seller_id":"user-marcus","name":"SodaWorld API Pro License","type":"License","price":10000,"description":"Annual pro license: 100k API calls/month, priority support, custom webhooks, white-label dashboard. For beverage brands on SodaWorld.","image_url":"https://picsum.photos/seed/mkt13/400/400","category":"Software","quantity":999,"sold_count":4,"status":"active","creator_name":"Marcus Chen","creator_avatar_url":"https://picsum.photos/seed/marcus/100/100","edition_current":None,"edition_total":None,"created_at":"2026-01-10 10:00:00"},
]
for m in mkts:
    ii("marketplace_items", m)

print("=== KNOWLEDGE ===")
kis = [
    ("ki-11","1","treasury","financial","Q4 2025 Financial Summary","Revenue: 450,000 SODA from marketplace fees. Expenses: 280,000 SODA (dev bounties 120k, marketing 80k, legal 50k, infra 30k). Net: +170,000 SODA. Treasury grew 18% QoQ.","system",0.98,"finance,quarterly,report"),
    ("ki-12","1","governance","decision","Coca-Cola Partnership Approved","Strategic partnership with Coca-Cola Ventures approved with 91% approval. $500k investment secured. Pilot program for 3 Coca-Cola brands in Q2 2026.","system",0.99,"partnership,coca-cola"),
    ("ki-13","1","legal","compliance","SEC Token Classification","SODA token classified as utility token under SEC guidance. Legal opinion confirms no security classification under Howey Test. Provides governance and access, not investment returns.","user-lisa",0.95,"legal,sec,compliance"),
    ("ki-14","1","coach","risk","Key Person Dependency Risk","High dependency on Marcus Chen (CTO) for technical decisions. Mitigation: Hire VP of Engineering (proposal p7), document architecture, cross-train Emma. Risk level: Medium.","system",0.85,"risk,team"),
    ("ki-15","1","product","roadmap","2026 Product Roadmap","Q1: SDK + Dev Portal. Q2: DeFi (Raydium, Marinade). Q3: Cross-chain bridge + Mobile beta. Q4: Metaverse + AI governance automation. Target: 1000 active devs by Q4.","user-marcus",0.92,"roadmap,product"),
    ("ki-16","1","community","engagement","Community Growth Metrics","Discord: 12,847 (up 34% MoM). Twitter: 45,200 (up 22%). GitHub: 892 stars, 234 forks, 67 contributors. Weekly active governance: 156. Bubble backers: 275.","user-alex",0.97,"community,metrics"),
    ("ki-17","1","treasury","policy","Multi-Sig Treasury Policy Update","Under 5k SODA: 1/3 signers. 5k-50k: 2/3 signers. Over 50k: full council vote. Emergency: all 3 signers + 24hr timelock.","user-sarah",0.99,"treasury,policy"),
    ("ki-18","1","legal","agreement","Contributor Agreement Best Practices","All contributor agreements must include: IP assignment, confidentiality, token vesting with cliff, termination conditions, arbitration, non-compete (founders only).","user-lisa",0.96,"legal,agreements"),
    ("ki-19","1","governance","process","Proposal Lifecycle Documentation","Draft -> Pending (3-day review) -> Active (7-day vote) -> Passed/Failed. Quorum: 50%. Approval: 50% standard, 60% treasury, 75% constitutional.","user-sarah",0.99,"governance,process"),
    ("ki-20","1","product","technical","Architecture Decision: Solana","Why Solana: Sub-second finality, <$0.01 tx costs, growing DeFi ecosystem (Raydium, Marinade, Solend), Rust aligns with team. Trade-off: Smaller ecosystem, mitigated by Wormhole bridge.","user-marcus",0.94,"architecture,solana"),
    ("ki-21","1","coach","strategy","Competitive Landscape Analysis","Competitors: FriendsWithBenefits (social), PleasrDAO (collecting), MakerDAO (DeFi gov). Our moat: First-mover in beverage-industry DAO tooling + AI-augmented governance.","system",0.88,"strategy,competition"),
    ("ki-22","1","treasury","audit","Smart Contract Audit Results","CertiK audit of SODA token: 0 critical, 1 major (fixed), 3 minor, 5 informational. Score: 94/100. Published on-chain. Phase 2 audit for governance contracts Q2 2026.","system",0.97,"audit,security"),
    ("ki-23","1","community","culture","SodaWorld Community Values","Core values: 1) Transparency (all on-chain), 2) Inclusivity (low barrier), 3) Innovation (AI + emerging tech), 4) Sustainability (long-term), 5) Fun (we are a soda company).","user-alex",0.95,"community,values"),
    ("ki-24","1","governance","analytics","Voter Participation Trends","Average participation: 72% of eligible voting power. Highest: Coca-Cola (96%). Lowest: Token Burn (65%). Founders: 100%. Advisors: 85%. Contributors: 55%.","system",0.93,"governance,analytics"),
    ("ki-25","1","product","integration","Chainlink Oracle Integration Status","Price feed deployed on devnet. VRF for NFT minting 70% complete. Keeper automation for vesting planned Q2. Mainnet target: March 2026.","user-emma",0.91,"integration,chainlink"),
]
for k in kis:
    ii("knowledge_items",{"id":k[0],"dao_id":k[1],"module_id":k[2],"category":k[3],"title":k[4],"content":k[5],"source":k[6],"confidence":k[7],"tags":k[8],"embedding_vector":None,"created_by":k[6],"expires_at":None,"created_at":now,"updated_at":now})

print("=== BOUNTIES ===")
bts = [
    ("b-5","1","Build Cross-Chain Bridge UI","Design and implement the frontend for Wormhole bridge integration. Support SODA transfers between Solana and Ethereum with status tracking and fee estimation.",12000.0,"SODA","open","user-marcus",None,"2026-05-01","Frontend,Integration,Tests","frontend,bridge"),
    ("b-6","1","Create Video Tutorial Series","Produce 10-part video tutorial series covering SodaWorld fundamentals: wallet setup, token acquisition, governance, bubbles, marketplace. 5-10 min each.",8000.0,"SODA","open","user-alex",None,"2026-04-15","10 videos,Thumbnails,Transcripts","marketing,content"),
    ("b-7","1","Mobile App UI/UX Design","Complete UI/UX design for SodaWorld mobile app (iOS/Android). Governance voting, treasury dashboard, marketplace, push notifications. 40+ screens in Figma.",15000.0,"SODA","claimed","user-james","user-james","2026-04-01","Figma,Design system,Prototype","design,mobile"),
    ("b-8","1","Implement Vote Delegation System","Build Solana program for vote delegation. Delegate voting power without transferring tokens. Support partial delegation, revocation, max depth 3.",20000.0,"SODA","open","user-marcus",None,"2026-06-01","Solana program,Tests,Docs","smart-contract,governance"),
    ("b-9","1","Write API Documentation","Comprehensive docs for all 38 DAO backend endpoints. Request/response examples, auth guide, rate limiting, error codes, SDK examples in TypeScript and Python.",6000.0,"SODA","claimed","user-marcus","user-emma","2026-03-15","API docs,Examples,SDK guide","documentation,api"),
    ("b-10","1","Community Translation Program","Translate docs, UI, and marketing into Spanish, Portuguese, Japanese, Korean, and Mandarin. Each package includes whitepaper, website, app strings, guidelines.",10000.0,"SODA","open","user-alex",None,"2026-05-01","5 language packs,QA","community,translation"),
    ("b-11","1","Discord Bot Development","Custom Discord bot: governance notifications, token balance queries, proposal alerts, bubble updates, reputation tracking, auto role assignment. Must use SodaWorld API.",7000.0,"SODA","completed","user-alex","user-noah","2026-02-01","Bot code,Docs,Deployment","development,discord"),
    ("b-12","1","Tokenomics Simulation Model","Monte Carlo simulation for SODA tokenomics. Model supply/demand, vesting impacts, liquidity depths, governance under market scenarios. Jupyter notebook with visualizations.",9000.0,"SODA","open","user-david",None,"2026-04-01","Jupyter notebook,Report","tokenomics,analytics"),
]
for b in bts:
    ii("bounties",{"id":b[0],"dao_id":b[1],"title":b[2],"description":b[3],"reward_amount":b[4],"reward_token":b[5],"status":b[6],"created_by":b[7],"claimed_by":b[8],"deadline":b[9],"deliverables":b[10],"tags":b[11],"created_at":now,"updated_at":now})

print("=== TREASURY TRANSACTIONS ===")
txs = [
    ("tx-006","0xEmmaAddress","Emma Rodriguez",12000.0,"Smart contract development bounty - Q4 2025","Executed","2025-11-15T00:00:00Z","2025-11-16T00:00:00Z"),
    ("tx-007","0xAlexAddress","Alex Thompson",8000.0,"Community management monthly - Dec 2025","Executed","2025-12-01T00:00:00Z","2025-12-02T00:00:00Z"),
    ("tx-008","0xLisaAddress","Lisa Park",15000.0,"Legal counsel retainer - Q1 2026","Executed","2026-01-05T00:00:00Z","2026-01-06T00:00:00Z"),
    ("tx-009","0xDavidAddress","David Kumar",10000.0,"Blockchain advisory - Jan 2026","Executed","2026-01-15T00:00:00Z","2026-01-16T00:00:00Z"),
    ("tx-010","0xCertiKAddress","CertiK",35000.0,"Smart contract security audit - SODA token","Executed","2026-01-20T00:00:00Z","2026-01-21T00:00:00Z"),
    ("tx-011","0xETHDenverAddress","ETHDenver 2026",20000.0,"Gold sponsor package - ETHDenver 2026","Executed","2026-01-25T00:00:00Z","2026-01-26T00:00:00Z"),
    ("tx-012","0xAWSAddress","Amazon Web Services",5500.0,"Cloud infrastructure - Jan 2026","Executed","2026-02-01T00:00:00Z","2026-02-02T00:00:00Z"),
    ("tx-013","0xNoahAddress","Noah Davis",7000.0,"Discord bot bounty (b-11) completed","Executed","2026-02-05T00:00:00Z","2026-02-06T00:00:00Z"),
    ("tx-014","0xMarketingMultisig","Marketing Guild",45000.0,"Q1 marketing budget Phase 1 - social campaigns","Executed","2026-02-08T00:00:00Z","2026-02-09T00:00:00Z"),
    ("tx-015","0xJamesAddress","James Wright",18000.0,"Genesis NFT art direction milestone completed","Executed","2026-02-10T00:00:00Z","2026-02-11T00:00:00Z"),
    ("tx-016","0xEmmaAddress","Emma Rodriguez",6000.0,"API docs bounty (b-9) 50% milestone","Pending","2026-02-12T00:00:00Z",None),
    ("tx-017","0xCocaColaVentures","Coca-Cola Ventures",-500000.0,"Strategic investment received - partnership","Executed","2026-02-01T00:00:00Z","2026-02-02T00:00:00Z"),
    ("tx-018","0xLiquidityPool","Raydium SODA/USDC Pool",100000.0,"Initial liquidity provision","Pending","2026-02-13T00:00:00Z",None),
    ("tx-019","0xBugBountyAddr","HackerOne",25000.0,"Bug bounty program funding Q1 2026","Executed","2026-02-05T00:00:00Z","2026-02-06T00:00:00Z"),
    ("tx-020","0xAWSAddress","Amazon Web Services",5500.0,"Cloud infrastructure - Feb 2026","Pending","2026-02-14T00:00:00Z",None),
]
for t in txs:
    ii("treasury_transactions",{"id":t[0],"recipient":t[1],"recipientName":t[2],"amount":t[3],"memo":t[4],"status":t[5],"dateInitiated":t[6],"dateExecuted":t[7],"created_at":now,"updated_at":now})

print("=== TREASURY APPROVALS ===")
aps = [
    ("tx-006","0xAliceAddress"),("tx-006","0xBobAddress"),
    ("tx-007","0xAliceAddress"),("tx-007","0xCharlieAddress"),
    ("tx-008","0xAliceAddress"),("tx-008","0xBobAddress"),
    ("tx-009","0xBobAddress"),("tx-009","0xCharlieAddress"),
    ("tx-010","0xAliceAddress"),("tx-010","0xBobAddress"),("tx-010","0xCharlieAddress"),
    ("tx-011","0xAliceAddress"),("tx-011","0xBobAddress"),
    ("tx-012","0xAliceAddress"),("tx-012","0xCharlieAddress"),
    ("tx-013","0xAliceAddress"),("tx-013","0xBobAddress"),
    ("tx-014","0xAliceAddress"),("tx-014","0xBobAddress"),("tx-014","0xCharlieAddress"),
    ("tx-015","0xBobAddress"),("tx-015","0xCharlieAddress"),
    ("tx-017","0xAliceAddress"),("tx-017","0xBobAddress"),("tx-017","0xCharlieAddress"),
    ("tx-019","0xAliceAddress"),("tx-019","0xBobAddress"),
]
for a in aps:
    ii("treasury_approvals",{"transaction_id":a[0],"signer_address":a[1],"created_at":now})

print("=== USER BALANCES ===")
bals = [
    ("user-marcus",4000000,950),("user-sarah",4000000,920),("user-james",3000000,880),
    ("user-lisa",2000000,850),("user-david",1500000,820),("user-emma",1000000,780),
    ("user-alex",500000,750),("user-mia",500000,700),("user-noah",250000,680),
]
for b in bals:
    ii("user_balances",{"user_id":b[0],"soda_balance":b[1],"bubble_score":b[2],"created_at":now,"updated_at":now})

print("=== BUBBLES ===")
bubs = [
    {"id":"bubble-7","name":"Craft Soda Exchange","type":"Commerce","status":"Active","fundingProgress":85,"sodaRaised":42500,"backers":67,"healthScore":91,"team":'[{"name":"Maya Chen","role":"Lead"},{"name":"Jake Foster","role":"Dev"}]',"treasury":'{"balance":42500,"monthly_burn":3200}',"roadmap":'[{"title":"MVP Launch","status":"completed"},{"title":"Payment Integration","status":"in_progress"}]',"updates":'[{"title":"MVP Live! 200 craft sodas listed","date":"2026-01-20"}]',"created_at":now,"updated_at":now},
    {"id":"bubble-8","name":"SodaVerse Metaverse","type":"Gaming","status":"Active","fundingProgress":45,"sodaRaised":22500,"backers":134,"healthScore":68,"team":'[{"name":"Ryan Park","role":"Game Director"},{"name":"Sofia Lee","role":"3D Artist"}]',"treasury":'{"balance":22500,"monthly_burn":8000}',"roadmap":'[{"title":"Concept Art","status":"completed"},{"title":"Prototype","status":"in_progress"}]',"updates":'[{"title":"First gameplay footage revealed","date":"2026-02-01"}]',"created_at":now,"updated_at":now},
    {"id":"bubble-9","name":"Soda Science Lab","type":"Education","status":"Active","fundingProgress":70,"sodaRaised":14000,"backers":45,"healthScore":82,"team":'[{"name":"Dr. Nina Patel","role":"Lead Scientist"},{"name":"Tom Baker","role":"Content"}]',"treasury":'{"balance":14000,"monthly_burn":2000}',"roadmap":'[{"title":"Course Curriculum","status":"completed"},{"title":"Video Production","status":"in_progress"}]',"updates":'[{"title":"First 5 courses published","date":"2026-01-28"}]',"created_at":now,"updated_at":now},
    {"id":"bubble-10","name":"SodaWorld Charity Fund","type":"Social Impact","status":"Active","fundingProgress":95,"sodaRaised":47500,"backers":203,"healthScore":95,"team":'[{"name":"Grace Kim","role":"Director"},{"name":"Omar Hassan","role":"Operations"}]',"treasury":'{"balance":47500,"monthly_burn":5000}',"roadmap":'[{"title":"Clean Water Initiative","status":"completed"},{"title":"School Partnership Program","status":"in_progress"}]',"updates":'[{"title":"3 clean water wells funded in Kenya","date":"2026-01-15"},{"title":"UNICEF partnership announced","date":"2026-02-12"}]',"created_at":now,"updated_at":now},
]
for b in bubs:
    ii("bubbles", b)

print("=== ADMIN LOGS ===")
alogs = [
    (str(uuid.uuid4()),"proposal_created",'{"proposal_id":"p3","title":"Q1 Marketing Budget","author":"Alex Thompson"}',"100.73.133.3","Mozilla/5.0",None,1,"2026-02-10T08:00:00Z"),
    (str(uuid.uuid4()),"proposal_created",'{"proposal_id":"p4","title":"Coca-Cola Partnership","author":"Sarah Williams"}',"100.73.133.3","Mozilla/5.0",None,1,"2026-01-25T09:00:00Z"),
    (str(uuid.uuid4()),"proposal_passed",'{"proposal_id":"p4","votes_for":3200000,"votes_against":100000}',"100.73.133.3","system",None,1,"2026-02-01T00:00:00Z"),
    (str(uuid.uuid4()),"agreement_signed",'{"agreement_id":"agr-f1","signer":"Marcus Chen","type":"founder"}',"100.73.133.3","Mozilla/5.0",None,1,"2024-01-15T10:00:00Z"),
    (str(uuid.uuid4()),"treasury_transfer",'{"tx_id":"tx-010","amount":35000,"recipient":"CertiK"}',"100.73.133.3","system",None,1,"2026-01-20T00:00:00Z"),
    (str(uuid.uuid4()),"bounty_completed",'{"bounty_id":"b-11","claimed_by":"Noah Davis","reward":7000}',"100.73.133.3","system",None,1,"2026-02-01T00:00:00Z"),
    (str(uuid.uuid4()),"member_joined",'{"member":"Mia Johnson","role":"firstborn","tokens":500000}',"100.73.133.3","Mozilla/5.0",None,1,"2024-02-10T10:00:00Z"),
    (str(uuid.uuid4()),"proposal_failed",'{"proposal_id":"p10","title":"Token Burn","for":900000,"against":2100000}',"100.73.133.3","system",None,1,"2026-02-08T00:00:00Z"),
    (str(uuid.uuid4()),"login_success",'{"ip":"100.73.133.3","userAgent":"Chrome/121"}',"100.73.133.3","Chrome/121","session-marcus-001",1,"2026-02-14T08:00:00Z"),
    (str(uuid.uuid4()),"login_success",'{"ip":"100.73.133.4","userAgent":"Safari/17"}',"100.73.133.4","Safari/17","session-sarah-001",1,"2026-02-14T08:30:00Z"),
    (str(uuid.uuid4()),"sdk_released",'{"version":"1.0.0","license":"MIT","repo":"github.com/sodaworld/sdk"}',"100.73.133.3","system",None,1,"2026-02-05T00:00:00Z"),
    (str(uuid.uuid4()),"audit_completed",'{"auditor":"CertiK","score":94,"critical":0,"major":1}',"100.73.133.3","system",None,1,"2026-01-25T00:00:00Z"),
]
for a in alogs:
    ii("admin_logs",{"id":a[0],"action":a[1],"details":a[2],"ip_address":a[3],"user_agent":a[4],"session_id":a[5],"success":a[6],"timestamp":a[7]})

db.commit()

print("\n" + "=" * 60)
print("SODAWORLD DAO DATABASE POPULATION COMPLETE")
print("=" * 60)
total = 0
for t, c in sorted(counts.items()):
    print(f"  {t}: {c} rows added")
    total += c
print(f"\n  TOTAL: {total} rows added")

print("\n=== VERIFICATION ===")
for t in ['proposals','proposal_votes','votes','agreement_signatures','milestones','marketplace_items','knowledge_items','bounties','treasury_transactions','treasury_approvals','bubbles','user_balances','admin_logs']:
    cur.execute(f"SELECT COUNT(*) FROM {t}")
    print(f"  {t}: {cur.fetchone()[0]} total rows")

db.close()
print("\nDONE_POPULATE")
'''

b64 = base64.b64encode(inner_script.encode()).decode()
print(f"Script size: {len(inner_script)} bytes, base64: {len(b64)} chars")

# Write using PowerShell file write with chunks via a temp b64 file
# First clear the file
send_cmd("'' | Set-Content -Path 'C:\\Users\\User\\pop_b64.txt' -NoNewline")
time.sleep(1)

# Split into chunks small enough for PowerShell command line
chunk_size = 6000
chunks = [b64[i:i+chunk_size] for i in range(0, len(b64), chunk_size)]
print(f"Sending {len(chunks)} chunks...")

for i, chunk in enumerate(chunks):
    send_cmd(f"Add-Content -Path 'C:\\Users\\User\\pop_b64.txt' -Value '{chunk}' -NoNewline")
    time.sleep(0.3)

time.sleep(2)
print("Chunks sent. Decoding...")

# Decode base64 to Python file
send_cmd("$b = Get-Content 'C:\\Users\\User\\pop_b64.txt' -Raw; [IO.File]::WriteAllBytes('C:\\Users\\User\\pop_dao.py', [Convert]::FromBase64String($b)); echo 'FILE_READY'")
time.sleep(4)

buf = read_buffer(3000)
if "FILE_READY" in buf:
    print("File decoded successfully!")
else:
    print("Decode status:")
    print(buf[-800:])

# Run the script
print("\nRunning population script...")
send_cmd("python C:\\Users\\User\\pop_dao.py")
time.sleep(15)

output = read_buffer(15000)
print(output)
