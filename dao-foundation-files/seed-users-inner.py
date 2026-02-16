import sqlite3, json, os, time

DB = r'C:\Users\User\Documents\GitHub\DAOV1\backend\mentor_chats.db'
conn = sqlite3.connect(DB)
conn.execute('PRAGMA journal_mode=WAL')
conn.execute('PRAGMA foreign_keys=ON')
cur = conn.cursor()

# Check current users count
cur.execute('SELECT COUNT(*) FROM users')
user_count = cur.fetchone()[0]
print(f'EXISTING_USERS={user_count}')

if user_count == 0:
    # Get council members to create matching user accounts
    cur.execute('SELECT id, name, role, wallet_address, email FROM council_members')
    members = cur.fetchall()
    print(f'COUNCIL_MEMBERS={len(members)}')

    for m in members:
        cid, name, role, wallet, email = m
        # Create user
        cur.execute('''INSERT INTO users (id, name, email, wallet_address, role, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))''',
                    (cid, name, email or f'{name.lower().replace(" ",".")}@sodaworld.dao',
                     wallet or f'0x{cid:040x}', role))
        print(f'  USER_CREATED: {name} ({role})')

    conn.commit()
    print(f'USERS_SEEDED={len(members)}')
else:
    print(f'USERS_ALREADY_EXIST={user_count}')

# Check user_profiles
cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='user_profiles'")
has_profiles = cur.fetchone()
if has_profiles:
    cur.execute('SELECT COUNT(*) FROM user_profiles')
    profile_count = cur.fetchone()[0]
    print(f'EXISTING_PROFILES={profile_count}')

    if profile_count == 0:
        cur.execute('SELECT id, name, role FROM users')
        users = cur.fetchall()
        for u in users:
            uid, name, role = u
            try:
                cur.execute('''INSERT INTO user_profiles (user_id, display_name, bio, avatar_url, created_at)
                               VALUES (?, ?, ?, ?, datetime('now'))''',
                            (uid, name, f'{role} at SodaWorld DAO', f'/avatars/{name.lower().replace(" ","_")}.png'))
                print(f'  PROFILE_CREATED: {name}')
            except Exception as e:
                print(f'  PROFILE_SKIP: {name} - {e}')
        conn.commit()
        print(f'PROFILES_SEEDED')
else:
    print('NO_USER_PROFILES_TABLE')

# Check dao_members
cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='dao_members'")
has_dao_members = cur.fetchone()
if has_dao_members:
    cur.execute('SELECT COUNT(*) FROM dao_members')
    dm_count = cur.fetchone()[0]
    print(f'EXISTING_DAO_MEMBERS={dm_count}')

    if dm_count == 0:
        cur.execute('SELECT id FROM daos LIMIT 1')
        dao_row = cur.fetchone()
        if dao_row:
            dao_id = dao_row[0]
            cur.execute('SELECT id, name, role FROM users')
            users = cur.fetchall()
            for u in users:
                uid, name, role = u
                try:
                    cur.execute('''INSERT INTO dao_members (dao_id, user_id, role, status, joined_at)
                                   VALUES (?, ?, ?, 'active', datetime('now'))''',
                                (dao_id, uid, role))
                    print(f'  DAO_MEMBER_CREATED: {name}')
                except Exception as e:
                    print(f'  DAO_MEMBER_SKIP: {name} - {e}')
            conn.commit()
            print('DAO_MEMBERS_SEEDED')
else:
    print('NO_DAO_MEMBERS_TABLE')

# Create backup
backup_dir = r'C:\Users\User\Documents\GitHub\DAOV1\backend\backups'
os.makedirs(backup_dir, exist_ok=True)
backup_path = os.path.join(backup_dir, 'mentor_chats_backup_2026-02-15.db')
if not os.path.exists(backup_path):
    backup_conn = sqlite3.connect(backup_path)
    conn.backup(backup_conn)
    backup_conn.close()
    size_mb = os.path.getsize(backup_path) / (1024*1024)
    print(f'BACKUP_CREATED={backup_path} ({size_mb:.1f}MB)')
else:
    print(f'BACKUP_EXISTS={backup_path}')

# Final stats
print('\n=== FINAL TABLE COUNTS ===')
for t in ['users','user_profiles','dao_members','council_members','daos','proposals','agreements',
          'milestones','marketplace_items','knowledge_items','bounties','treasury_transactions',
          'bubbles','votes','vesting_schedules','vesting_unlocks','ai_conversations','messages']:
    try:
        cur.execute(f'SELECT COUNT(*) FROM {t}')
        print(f'  {t}: {cur.fetchone()[0]}')
    except:
        print(f'  {t}: TABLE_MISSING')

conn.close()
print('\nDONE')
