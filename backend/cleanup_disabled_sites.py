import sqlite3
from pathlib import Path

db_path = Path(r"d:\Delta\heritage2\HeritageLens\backend\var\heritagelens.db")
slugs = [
    "meenakshi",
    "shaniwar-wada",
    "ajanta-caves",
]

conn = sqlite3.connect(db_path)
cur = conn.cursor()
print("before", cur.execute(
    "SELECT COUNT(*) FROM sites WHERE slug IN (%s)" % ",".join("?" for _ in slugs),
    tuple(slugs),
).fetchone()[0])
cur.execute(
    "DELETE FROM sites WHERE slug IN (%s)" % ",".join("?" for _ in slugs),
    tuple(slugs),
)
conn.commit()
print("after", cur.execute(
    "SELECT COUNT(*) FROM sites WHERE slug IN (%s)" % ",".join("?" for _ in slugs),
    tuple(slugs),
).fetchone()[0])
print("sample", cur.execute("SELECT slug FROM sites ORDER BY slug LIMIT 10").fetchall())
conn.close()
