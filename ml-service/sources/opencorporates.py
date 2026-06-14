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
    """Search OpenCorporates by company name. Returns first match as dict."""
    if not OC_KEY:
        # Return a stub so graph builds without an API key during development
        return _mock_company(name)

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(f"{OC_BASE}/companies/search", params={
            "q":       name,
            "api_token": OC_KEY,
            "per_page": 1,
        })

    if resp.status_code != 200:
        return None

    results = resp.json().get("results", {}).get("companies", [])
    if not results:
        return None

    c = results[0]["company"]
    return {
        "opencorporatesId":   c.get("company_number"),
        "name":               c.get("name"),
        "entity_type":        "company",
        "jurisdiction":       c.get("jurisdiction_code", "").upper()[:2],
        "incorporationDate":  c.get("incorporation_date"),
        "status":             c.get("current_status", "unknown"),
        "officer_count":      c.get("officers_count", 0),
        "filing_count":       c.get("filings_count", 0),
        "uses_registered_agent": False,
        "raw_url":            c.get("opencorporates_url"),
    }


async def fetch_related_entities(entity_id: str, entity_name: str, db) -> list:
    """
    Fetch officers, shareholders, and subsidiaries for a company.
    Returns list of { id, name, relationship, share_pct }
    """
    if not OC_KEY:
        return _mock_related(entity_id, entity_name)

    # In production: parse entity_id to get jurisdiction + company number,
    # then call /companies/:jurisdiction/:id/officers and /companies/:jurisdiction/:id/network
    # For now, returns stub data for Week 4 graph testing
    return _mock_related(entity_id, entity_name)


def _mock_company(name: str) -> dict:
    """
    Stub company data for development (no API key needed).
    Returns plausible-looking company data for the graph builder.
    """
    import hashlib
    h = int(hashlib.md5(name.encode()).hexdigest()[:8], 16)
    jurisdictions = ['GB', 'AE', 'CY', 'NL', 'RU', 'US', 'KY', 'VG']
    return {
        "name":          name,
        "entity_type":   "company",
        "jurisdiction":  jurisdictions[h % len(jurisdictions)],
        "status":        "active",
        "officer_count": (h % 5) + 1,
        "filing_count":  (h % 20),
        "uses_registered_agent": bool(h % 3 == 0),
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
