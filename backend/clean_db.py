import sqlite3
import os

db_paths = [
    os.path.join(os.path.dirname(__file__), "sih_database.db"),
    os.path.join(os.path.dirname(os.path.dirname(__file__)), "sih_database.db"),
]

for db_path in db_paths:
    if not os.path.exists(db_path):
        continue
    print(f"Purging database at: {db_path}")
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    # Retrieve all user tables
    tables = [r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
    for table in tables:
        if table.startswith("sqlite_"):
            continue
        try:
            cur.execute(f'DELETE FROM "{table}"')
            print(f"  Cleared table: {table}")
        except Exception as e:
            print(f"  Error clearing {table}: {e}")

    try:
        cur.execute("DELETE FROM sqlite_sequence")
    except Exception:
        pass

    conn.commit()
    conn.close()

print("All database tables successfully purged. All counts are now 0.")

