"""
ml-service/scripts/seed_ofac.py
Run ONCE to seed OFAC SDN list into MongoDB.

OFAC publishes the SDN list free at:
  https://www.treasury.gov/ofac/downloads/sdn.csv

Usage: python scripts/seed_ofac.py
Same pattern works for ICIJ Offshore Leaks CSVs.
"""
import asyncio, csv, io, os, re
import httpx
from motor.motor_asyncio import AsyncIOMotorClient

OFAC_CSV_URL = "https://www.treasury.gov/ofac/downloads/sdn.csv"
# NOTE: was hardcoded to "mongodb://localhost:27017". Inside the ml-service
# Docker container there is no Mongo on localhost — the mongo container is
# only reachable at hostname "mongo" (see docker-compose.yml). Running this
# script with `docker compose exec ml-service ...` would connect to nothing,
# time out/fail, and leave ofac_sdn permanently empty. Now matches the same
# MONGODB_URI env var every other service in this repo uses.
MONGO_URI    = os.getenv("MONGODB_URI", "mongodb://localhost:27017/sanctiongraph")

def normalize(name: str) -> str:
    n = re.sub(r'[.,\-\'"()]', ' ', name.lower())
    return re.sub(r'\s+', ' ', n).strip()

async def seed():
    print("Downloading OFAC SDN list...")
    headers = {
        # Government sites' bot-detection (e.g. Akamai/Cloudflare-style WAFs)
        # blocks the default "python-httpx/x.x" user agent and returns a
        # small block/challenge page instead of the CSV. That page is what
        # was silently getting parsed as "0 records" before this fix.
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "text/csv,text/plain,*/*",
    }
    async with httpx.AsyncClient(timeout=60, headers=headers, follow_redirects=True) as client:
        resp = await client.get(OFAC_CSV_URL)

    print(f"HTTP {resp.status_code}, {len(resp.content)} bytes, "
          f"content-type={resp.headers.get('content-type')}")

    if resp.status_code != 200 or len(resp.content) < 10_000:
        # A real SDN CSV is several MB. Anything tiny is a block page, a
        # redirect target, or an error — not sanctions data. Fail loudly
        # instead of quietly seeding an empty/garbage collection.
        preview = resp.text[:300].replace("\n", " ")
        raise RuntimeError(
            f"Response doesn't look like the OFAC CSV (too small or bad "
            f"status). First 300 chars: {preview!r}\n"
            f"The download URL may have moved — check "
            f"https://ofac.treasury.gov/sanctions-list-service for the "
            f"current SDN CSV link and update OFAC_CSV_URL if needed."
        )

    print("Parsing...")

    reader  = csv.reader(io.StringIO(resp.text))
    records = []
    for row in reader:
        if len(row) < 4: continue
        sdn_id, name, sdn_type, program = row[0], row[1], row[2], row[3]
        if not name.strip() or name.strip() == '-0-': continue
        records.append({
            "sdn_id": sdn_id.strip(), "name": name.strip(),
            "name_normalized": normalize(name), "type": sdn_type.strip(),
            "program": program.strip(),
        })

    db = AsyncIOMotorClient(MONGO_URI).sanctiongraph
    await db.ofac_sdn.drop()
    if records:
        res = await db.ofac_sdn.insert_many(records)
        print(f"Seeded {len(res.inserted_ids)} OFAC entities")
    await db.ofac_sdn.create_index("name_normalized")
    print("Done.")

if __name__ == "__main__":
    asyncio.run(seed())