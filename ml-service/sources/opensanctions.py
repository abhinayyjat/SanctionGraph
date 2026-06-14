"""
LEARNING — OpenSanctions API integration + local OFAC seed
OpenSanctions aggregates 100+ national sanctions lists into one API.
Free API key from: https://www.opensanctions.org/api/

We also check our locally seeded OFAC SDN list (MongoDB collection).
Seeded by: scripts/seed_ofac.py using the free US Treasury CSV.
Checking local DB first means fewer API calls and faster responses.
"""

import os, re, httpx
from rapidfuzz import fuzz

OPENSANCTIONS_URL = "https://api.opensanctions.org/match/sanctions"
HF_TOKEN = os.getenv("OPENSANCTIONS_API_KEY", "")

def _normalize(name: str) -> str:
    return re.sub(r'\s+', ' ', name.lower().strip())


async def check_sanctions(name: str, db) -> dict:
    """
    Check entity against:
    1. Locally seeded OFAC SDN (fast, free, no API call)
    2. OpenSanctions API (live, comprehensive 100+ lists)

    Returns: { direct_hit: bool, score: 0-100, sources: [...] }
    """
    # ── 1. Local OFAC check (seeded from US Treasury free CSV) ───────────────
    norm = _normalize(name)
    local_candidates = await db.ofac_sdn.find(
        { "name_normalized": { "$regex": norm[:5], "$options": "i" } },
        limit=30
    ).to_list(30)

    local_hit = None
    for c in local_candidates:
        score = fuzz.token_set_ratio(norm, c.get("name_normalized", ""))
        if score >= 90:
            local_hit = c
            break

    if local_hit:
        return {
            "direct_hit": True,
            "score":      100,
            "sources":    ["OFAC_SDN"],
            "details":    {
                "program": local_hit.get("program"),
                "type":    local_hit.get("type"),
                "id":      local_hit.get("sdn_id"),
            }
        }

    # ── 2. OpenSanctions API (live check) ────────────────────────────────────
    if not HF_TOKEN:
        # No API key — skip live check, return clean
        return { "direct_hit": False, "score": 0, "sources": [] }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                OPENSANCTIONS_URL,
                headers={ "Authorization": f"ApiKey {HF_TOKEN}" },
                json={
                    "queries": {
                        "q1": {
                            "schema": "LegalEntity",
                            "properties": { "name": [name] }
                        }
                    }
                }
            )
        if resp.status_code != 200:
            return { "direct_hit": False, "score": 0, "sources": [] }

        data    = resp.json()
        results = data.get("responses", {}).get("q1", {}).get("results", [])

        if results:
            top     = results[0]
            sources = [d.get("dataset","unknown") for d in top.get("datasets", [])]
            return {
                "direct_hit": True,
                "score":      100,
                "sources":    sources,
                "details":    {
                    "caption":  top.get("caption"),
                    "schema":   top.get("schema"),
                    "match_score": top.get("score"),
                }
            }
    except Exception:
        pass  # don't crash the graph build if sanctions API is down

    return { "direct_hit": False, "score": 0, "sources": [] }
