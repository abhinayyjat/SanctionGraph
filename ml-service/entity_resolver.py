"""
ml-service/entity_resolver.py

LEARNING — Fuzzy String Matching with rapidfuzz
════════════════════════════════════════════════

Problem: The same company appears differently across registries:
  - OpenCorporates UK:  "Huawei Technologies Co., Limited"
  - OFAC SDN list:      "HUAWEI TECHNOLOGIES COMPANY LIMITED"
  - UAE registry:       "Huawei Tech Co Ltd"
  - Local DB cache:     "Huawei Technologies"

Exact string matching fails. We need fuzzy matching.

rapidfuzz implements several Levenshtein-based algorithms:
  - fuzz.ratio(): pure character-level edit distance (0–100)
  - fuzz.token_set_ratio(): best for company names
    → tokenizes both strings, takes the intersection + remainder
    → "Tech Huawei Ltd" vs "Huawei Tech" → 100 (handles reordering)
  - fuzz.token_sort_ratio(): sorts tokens alphabetically then compares
    → handles word reordering but is stricter than token_set

We use a weighted combo:
  ratio * 0.20 + token_set_ratio * 0.50 + token_sort_ratio * 0.30

Why 0.50 weight on token_set_ratio?
→ It's the most robust for business names where word order varies.

Cache-Aside pattern:
  1. Normalize query (lowercase, strip suffixes)
  2. Do a rough MongoDB regex filter (first 4 chars) to get candidates
  3. Run fuzzy similarity on candidates — O(n) but n is small (50 docs)
  4. If score ≥ 85 → cache hit
  5. If no match → call OpenCorporates API → store result in cache
"""

import re
from datetime import datetime
from rapidfuzz import fuzz
from sources.opencorporates import fetch_company_by_name

# Common company suffixes to strip before comparison
SUFFIX_RE = re.compile(
    r'\b(ltd|llc|inc|corp|co|gmbh|bv|sa|srl|plc|ag|nv|oy|ab|as|aps|pvt|llp|'
    r'limited|incorporated|corporation|company|group|holdings|international)\b',
    re.IGNORECASE
)


def normalize_name(name: str) -> str:
    """
    Normalize a company name for comparison.
    "Huawei Technologies Co., Ltd." → "huawei technologies"
    """
    n = name.lower().strip()
    n = re.sub(r'[.,\-\'\"()&@#]', ' ', n)  # remove punctuation
    n = SUFFIX_RE.sub('', n)                  # strip legal suffixes
    n = re.sub(r'\s+', ' ', n).strip()        # collapse spaces
    return n


def similarity(name_a: str, name_b: str) -> float:
    """
    Compute composite fuzzy similarity score between two company names.
    Returns 0–100 (float).
    """
    a = normalize_name(name_a)
    b = normalize_name(name_b)

    if a == b:
        return 100.0  # exact match after normalization

    score = (
        fuzz.ratio(a, b)              * 0.20 +  # character-level
        fuzz.token_set_ratio(a, b)    * 0.50 +  # best for reordered words
        fuzz.token_sort_ratio(a, b)   * 0.30    # alphabetically sorted tokens
    )
    return round(score, 2)


async def resolve_entity(name: str, db, threshold: float = 85.0) -> dict:
    """
    Resolve entity name against cache, then API if needed.

    Returns a dict with entity data + match_score + from_cache flag.
    """
    normalized = normalize_name(name)
    prefix     = normalized[:4]  # first 4 chars for rough MongoDB pre-filter

    # ── Check cache first ─────────────────────────────────────────────────────
    # MongoDB regex to get a small candidate set (avoids full collection scan)
    # LEARNING: We don't run fuzzy matching on ALL documents in MongoDB —
    # that would be O(n) on the full collection. We pre-filter with regex first,
    # then run fuzzy match on the small candidate set (typically <50 docs).
    candidates = await db.entities.find(
        { "normalizedName": { "$regex": prefix, "$options": "i" } },
        limit=50
    ).to_list(50)

    best_score  = 0.0
    best_entity = None
    for c in candidates:
        score = similarity(name, c.get("name", ""))
        if score > best_score:
            best_score  = score
            best_entity = c

    if best_entity and best_score >= threshold:
        # Check if cache is fresh (less than 7 days old)
        cached_at = best_entity.get("cachedAt")
        age_days  = (datetime.utcnow() - cached_at).days if cached_at else 999
        if age_days < 7:
            return {
                **best_entity,
                "match_score": best_score,
                "from_cache":  True,
                "id": str(best_entity.get("_id") or best_entity.get("id", name)),
            }

    # ── Cache miss → fetch from OpenCorporates ────────────────────────────────
    entity = await fetch_company_by_name(name)
    if entity:
        entity["normalizedName"] = normalize_name(entity.get("name", name))
        entity["cachedAt"]       = datetime.utcnow()
        result = await db.entities.insert_one(entity)
        entity["id"] = str(result.inserted_id)

    return {
        **(entity or { "name": name, "entity_type": "unknown", "jurisdiction": "" }),
        "match_score": 100.0 if entity else 0.0,
        "from_cache":  False,
        "id": entity.get("id", name) if entity else name,
    }
