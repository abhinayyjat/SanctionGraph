"""
ml-service/scripts/seed_ofac.py
Run ONCE to seed OFAC SDN list into MongoDB.

OFAC publishes the SDN list free at:
  https://www.treasury.gov/ofac/downloads/sdn.csv

Usage: python scripts/seed_ofac.py
Same pattern works for ICIJ Offshore Leaks CSVs.
"""
import asyncio, csv, io, re
import httpx
from motor.motor_asyncio import AsyncIOMotorClient

OFAC_CSV_URL = "https://www.treasury.gov/ofac/downloads/sdn.csv"
MONGO_URI    = "mongodb://localhost:27017"

def normalize(name: str) -> str:
    n = re.sub(r'[.,\-\'"()]', ' ', name.lower())
    return re.sub(r'\s+', ' ', n).strip()

async def seed():
    print("Downloading OFAC SDN list...")
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.get(OFAC_CSV_URL)
    print(f"Downloaded {len(resp.content)//1024}KB. Parsing...")

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
