"""
LEARNING — OpenCorporates API integration
OpenCorporates has 200M+ companies across 140+ jurisdictions.
Free tier: 100 calls/day. Get a key at opencorporates.com.

Key endpoints we use:
  GET /companies/search?q=name        → find company by name
  GET /companies/:jurisdiction/:id    → get company details + officers

For demo/Week 1-3: You can stub these functions with mock data.
They slot cleanly into the resolver — real API, mock, or cached data all
have the same return shape, so your graph still builds either way.
"""

import os, httpx

OC_BASE = "https://api.opencorporates.com/v0.4"
OC_KEY  = os.getenv("OPENCORPORATES_API_KEY", "")


async def fetch_company_by_name(name: str) -> dict | None:
    if not OC_KEY:
        return _mock_company(name)

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{OC_BASE}/companies/search",
            params={"q": name, "api_token": OC_KEY, "per_page": 1}
        )

    if resp.status_code != 200:
        return _mock_company(name)  # fallback gracefully

    results = resp.json().get("results", {}).get("companies", [])
    if not results:
        return None

    c = results[0]["company"]
    return {
    "opencorporatesId":  c.get("company_number"),
    "name":              c.get("name"),
    "entity_type":       "company",
    "jurisdiction":      (c.get("jurisdiction_code") or "").upper()[:2],
    "incorporationDate": c.get("incorporation_date"),
    "status":            c.get("current_status", "unknown"),
    "officer_count":     c.get("officers_count", 0),
    "filing_count":      c.get("filings_count", 0),
    "uses_registered_agent": False,
    "jurisdiction_code": c.get("jurisdiction_code"),
    "company_number":    c.get("company_number"),
    # This is the critical line — jurisdiction/number format
    "id": f"{c.get('jurisdiction_code')}/{c.get('company_number')}",
}


async def fetch_related_entities(entity_id: str, entity_name: str, db) -> list:
    if not OC_KEY:
        return _mock_related(entity_id, entity_name)

    # entity_id format we store: "jurisdiction_code/company_number"
    # e.g. "gb/12345678"
    if "/" not in entity_id:
        return _mock_related(entity_id, entity_name)

    jurisdiction, company_number = entity_id.split("/", 1)
    related = []

    async with httpx.AsyncClient(timeout=15) as client:
        # Fetch officers
        resp = await client.get(
            f"{OC_BASE}/companies/{jurisdiction}/{company_number}/officers",
            params={"api_token": OC_KEY, "per_page": 10}
        )
        if resp.status_code == 200:
            officers = resp.json().get("results", {}).get("officers", [])
            for o in officers:
                off = o.get("officer", {})
                name = off.get("name")
                if not name:
                    continue
                related.append({
                    "id":           f"officer_{name.lower().replace(' ','_')}",
                    "name":         name,
                    "relationship": "officer",
                    "share_pct":    None,
                })

    return related if related else _mock_related(entity_id, entity_name)

def _mock_company(name: str) -> dict:
    import hashlib
    h = int(hashlib.md5(name.encode()).hexdigest()[:8], 16)
    jurisdictions = ['gb', 'ae', 'cy', 'nl', 'us', 'ky', 'vg']
    jur = jurisdictions[h % len(jurisdictions)]
    fake_number = str(h)[:8]
    return {
        "name":          name,
        "entity_type":   "company",
        "jurisdiction":  jur.upper(),
        "status":        "active",
        "officer_count": (h % 5) + 1,
        "filing_count":  (h % 20),
        "uses_registered_agent": bool(h % 3 == 0),
        "jurisdiction_code": jur,
        "company_number":    fake_number,
        "id":  f"{jur}/{fake_number}",  # same format as real API
        "oc_id": f"{jur}/{fake_number}",
    }


def _mock_related(entity_id: str, entity_name: str) -> list:
    """Stub related entities for development."""
    import hashlib
    h = int(hashlib.md5(entity_id.encode()).hexdigest()[:8], 16)
    suffixes = ['Holdings Ltd','Advisory AG','Capital Partners','Finance LLC','Ventures BV']
    count    = (h % 3) + 1  # 1-3 related entities per node
    return [
        {
            "id":           f"{entity_id}_rel_{i}",
            "name":         f"{entity_name.split()[0]} {suffixes[(h+i) % len(suffixes)]}",
            "relationship": ["officer","shareholder","subsidiary"][i % 3],
            "share_pct":    round(25 + (h*i % 50), 1) if i % 3 != 0 else None,
        }
        for i in range(count)
    ]
