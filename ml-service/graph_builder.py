"""
ml-service/graph_builder.py

LEARNING — BFS (Breadth-First Search) Graph Traversal
═══════════════════════════════════════════════════════

This is the core of SanctionGraph. Here's how BFS works here:

    Seed: "Meridian Holdings Ltd"  (depth=0)
    ↓
    Fetch officers + shareholders of Meridian  (depth=1 entities)
    For each → check sanctions, add to graph
    ↓
    For each depth=1 entity → fetch THEIR officers + shareholders  (depth=2)
    For each → check sanctions, add to graph
    ↓
    Continue until max_hops reached

Visual:
    Meridian (0) → Alpine Advisory (1) → OOO Strelka (2) ← SANCTIONED!
                 → Kestrel Finance (1) → Solaris Ventures (2)

The key insight: a sanctioned entity 2 hops away means your client
has indirect exposure — possibly enough for regulatory trouble.

NetworkX is Python's standard graph library. We use DiGraph (directed)
because ownership is directional: A owns B ≠ B owns A.
"""

from collections import deque
import networkx as nx
from entity_resolver import resolve_entity, normalize_name
from risk_scorer import score_graph
from sources.opensanctions import check_sanctions
from sources.opencorporates import fetch_related_entities


async def build_graph(seed_name: str, max_hops: int, db) -> dict:
    """
    BFS traversal starting from seed_name.
    Returns a NetworkX node-link dict (JSON-serializable).
    """
    # LEARNING: DiGraph = Directed Graph
    # Directed because "Meridian OWNS Alpine" is different from "Alpine OWNS Meridian"
    G = nx.DiGraph()

    # visited: set of entity IDs we've already processed
    # Without this, we'd loop infinitely (A owns B owns C owns A → infinite loop)
    visited: set = set()

    # queue holds (entity_name_or_id, current_depth)
    # deque is more efficient than list for popleft() — O(1) vs O(n)
    queue = deque()

    # ── Step 1: Resolve seed entity ──────────────────────────────────────────
    seed_entity = await resolve_entity(seed_name, db)
    seed_id     = seed_entity.get("id") or f"seed_{normalize_name(seed_name)}"

    queue.append((seed_id, seed_name, 0))

    # ── Step 2: BFS loop ──────────────────────────────────────────────────────
    while queue:
        entity_id, entity_name, depth = queue.popleft()

        # Skip if already visited or exceeded max depth
        # LEARNING: This is how you prevent infinite loops in graph traversal
        if entity_id in visited or depth > max_hops:
            continue
        visited.add(entity_id)

        # ── Check sanctions for this entity ───────────────────────────────────
        # Every node gets checked against OpenSanctions + local OFAC seed
        sanctions = await check_sanctions(entity_name, db)

        # ── Add node to graph ─────────────────────────────────────────────────
        # node attributes are stored in the graph and appear in the JSON output
        entity_data = seed_entity if depth == 0 else \
                      (await resolve_entity(entity_name, db))

        G.add_node(entity_id, **{
            "name":          entity_name,
            "type":          entity_data.get("entity_type", "unknown"),
            "jurisdiction":  entity_data.get("jurisdiction", ""),
            "status":        entity_data.get("status", "unknown"),
            "officer_count": entity_data.get("officer_count", 0),
            "filing_count":  entity_data.get("filing_count", 0),
            "registered_agent": entity_data.get("uses_registered_agent", False),
            "sanctioned":    sanctions["direct_hit"],
            "sanctions_sources": sanctions["sources"],
            "in_icij":       entity_data.get("in_icij_database", False),
            "icij_datasets": entity_data.get("icij_datasets", []),
            "depth":         depth,
            "risk_score":    0,  # filled after BFS by score_graph()
        })

        # ── Fetch related entities (don't go deeper if at max_hops) ──────────
        if depth < max_hops:
            related = await fetch_related_entities(entity_id, entity_name, db)

            for rel in related:
                rel_id   = rel["id"]
                rel_name = rel["name"]

                # Add edge: entity_id → rel_id
                G.add_edge(entity_id, rel_id, **{
                    "relationship": rel["relationship"],  # 'officer' | 'shareholder' | 'subsidiary'
                    "share_pct":    rel.get("share_pct"),
                })

                # Add to queue for processing at next depth level
                if rel_id not in visited:
                    queue.append((rel_id, rel_name, depth + 1))

    # ── Step 3: Score all nodes ───────────────────────────────────────────────
    # LEARNING: We score AFTER the graph is fully built so we can compute
    # shortest paths from each node to the nearest sanctioned entity.
    # You can't compute shortest paths during BFS because you don't have the full graph yet.
    G = score_graph(G)

    # ── Step 4: Serialize to JSON ─────────────────────────────────────────────
    # nx.node_link_data() converts the graph to a dict that JSON can serialize:
    # { "nodes": [{"id": "...", "name": "...", ...}],
    #   "links": [{"source": "...", "target": "...", "relationship": "..."}] }
    # This is the format D3.js force simulation expects on the frontend.
    return nx.node_link_data(G)