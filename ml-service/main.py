"""
ml-service/main.py — Week 3
Adds /graph/build: the BFS traversal endpoint.
This is the most expensive call — 10-60s depending on graph size.
Node.js calls it from inside a Bull worker (not directly from a route).
"""
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorClient

from graph_builder import build_graph
from entity_resolver import resolve_entity
from sources.opensanctions import check_sanctions

db = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global db
    client = AsyncIOMotorClient(os.getenv("MONGODB_URI", "mongodb://localhost:27017"))
    db = client.sanctiongraph
    print("✓ MongoDB connected")
    yield
    client.close()

app = FastAPI(title="SanctionGraph ML Service", version="0.3.0", lifespan=lifespan)

class GraphRequest(BaseModel):
    entity_name: str
    max_hops: int = 3

class ResolveRequest(BaseModel):
    name: str

class SanctionsRequest(BaseModel):
    name: str

# ── NEW in Week 3 ─────────────────────────────────────────────────────────────
@app.post("/graph/build")
async def graph_build(req: GraphRequest):
    """
    BFS ownership graph traversal.
    LEARNING: This is called by the Bull worker in Node.js, not directly
    by a route. The worker runs in the background — the HTTP response
    to the user was already sent (202 Accepted) before this starts.
    Takes 10–60s depending on max_hops and OpenCorporates API speed.
    """
    if len(req.entity_name.strip()) < 2:
        raise HTTPException(status_code=400, detail="Entity name too short")
    if not 1 <= req.max_hops <= 5:
        raise HTTPException(status_code=400, detail="max_hops must be 1–5")
    try:
        graph = await build_graph(
            seed_name=req.entity_name.strip(),
            max_hops=req.max_hops,
            db=db
        )
        return {"success": True, "graph": graph}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── From Week 2 ───────────────────────────────────────────────────────────────
@app.post("/resolve")
async def resolve(req: ResolveRequest):
    result = await resolve_entity(req.name.strip(), db)
    return {"success": True, **result}

@app.post("/sanctions/check")
async def sanctions_check(req: SanctionsRequest):
    result = await check_sanctions(req.name.strip(), db)
    return {"success": True, **result}

@app.get("/icij/search")
async def icij_search(q: str):
    candidates = await db.icij_entities.find(
        {"name": {"$regex": q.lower().strip()[:5], "$options": "i"}}, limit=30
    ).to_list(30)
    matches = [r for r in candidates if q.lower() in r.get("name","").lower()]
    for m in matches: m.pop("_id", None)
    return {"success": True, "count": len(matches[:10]), "matches": matches[:10]}

@app.get("/health")
async def health():
    return {"status": "ok", "service": "ml-service", "week": 3}