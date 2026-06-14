"""
ml-service/risk_scorer.py

LEARNING — Risk Score Propagation with Graph Algorithms
════════════════════════════════════════════════════════

The key insight: if entity A owns entity B, and B is sanctioned,
then A has indirect exposure. How much exposure depends on
how many hops A is from B.

We use NetworkX's built-in shortest_path_length() for this.
LEARNING — Dijkstra's algorithm (what NetworkX uses internally):
  - Finds the shortest path between two nodes in O((V+E) log V)
  - We convert DiGraph to undirected for this — ownership direction
    doesn't matter for risk propagation (you're exposed either way)

Risk score components (additive, capped at 99):
  ┌─────────────────────────────────┬────────┐
  │ Factor                          │ Points │
  ├─────────────────────────────────┼────────┤
  │ Direct sanctions hit            │  100   │ (hard return, not additive)
  │ 1 hop from sanctioned entity   │  +70   │
  │ 2 hops                         │  +45   │
  │ 3 hops                         │  +20   │
  │ 4 hops                         │  +10   │
  │ High-risk jurisdiction (RU/IR) │  +15   │
  │ Secrecy jurisdiction (KY/PA)   │  +10   │
  │ In ICIJ Offshore Leaks DB      │  +10   │
  │ Shell company indicators (3+)  │  +15   │
  └─────────────────────────────────┴────────┘
"""

import networkx as nx

# Countries with active US/EU/UN sanctions regimes
HIGH_RISK_JURISDICTIONS = {
    'RU',  # Russia
    'IR',  # Iran
    'KP',  # North Korea
    'SY',  # Syria
    'BY',  # Belarus
    'VE',  # Venezuela (partially)
    'CU',  # Cuba
    'MM',  # Myanmar
}

# Countries known for corporate secrecy / offshore structures
SECRECY_JURISDICTIONS = {
    'PA',  # Panama
    'KY',  # Cayman Islands
    'VG',  # British Virgin Islands
    'BZ',  # Belize
    'SC',  # Seychelles
    'WS',  # Samoa
    'BH',  # Bahrain
    'AE',  # UAE (Dubai especially)
    'LI',  # Liechtenstein
    'SM',  # San Marino
}

# Points awarded by hop distance to nearest sanctioned entity
HOP_SCORE = { 1: 70, 2: 45, 3: 20, 4: 10 }


def _min_distance_to_sanctioned(node_id: str, G: nx.DiGraph) -> int:
    """
    Find the shortest path from node_id to any sanctioned node.
    Returns 99 if no sanctioned nodes exist in the graph.

    LEARNING: We convert DiGraph → undirected for this calculation.
    Risk propagates regardless of direction — if you own a sanctioned
    company OR if a sanctioned company owns you, you're exposed.
    """
    sanctioned_ids = [
        n for n, d in G.nodes(data=True) if d.get('sanctioned')
    ]
    if not sanctioned_ids:
        return 99

    G_undirected = G.to_undirected()
    min_dist = 99

    for sid in sanctioned_ids:
        try:
            d = nx.shortest_path_length(G_undirected, node_id, sid)
            if d < min_dist:
                min_dist = d
        except nx.NetworkXNoPath:
            pass  # no path to this sanctioned node — skip

    return min_dist


def _is_shell_company(node_data: dict) -> bool:
    """
    Heuristic detection of shell company structure.
    3 or more indicators = likely shell.

    LEARNING: This is a simplified version of what compliance analysts
    actually look for. Real tools also check employee count, revenue,
    physical office address, nature of business, etc.
    """
    indicators = [
        node_data.get('officer_count', 0) <= 1,      # single/no director
        node_data.get('filing_count', 0) == 0,        # no regulatory filings
        node_data.get('registered_agent', False),      # uses a registered agent address
        node_data.get('type') == 'company' and
          node_data.get('jurisdiction') in SECRECY_JURISDICTIONS,
    ]
    return sum(indicators) >= 3  # 3+ indicators → flag as likely shell


def score_node(node_id: str, G: nx.DiGraph) -> int:
    """Compute risk score for a single node. Returns 0–100."""
    node = G.nodes[node_id]

    # Direct hit: maximum score, hard return
    if node.get('sanctioned'):
        return 100

    score = 0

    # ── Hop distance to nearest sanctioned entity ─────────────────────────
    dist  = _min_distance_to_sanctioned(node_id, G)
    score += HOP_SCORE.get(dist, 0)

    # ── Jurisdictional risk ───────────────────────────────────────────────
    jur = (node.get('jurisdiction') or '').upper()
    if jur in HIGH_RISK_JURISDICTIONS:
        score += 15
    elif jur in SECRECY_JURISDICTIONS:
        score += 10

    # ── ICIJ database presence ────────────────────────────────────────────
    if node.get('in_icij'):
        score += 10

    # ── Shell company heuristics ──────────────────────────────────────────
    if _is_shell_company(node):
        score += 15

    # Cap at 99 — only direct sanctions hits get 100
    return min(score, 99)


def score_graph(G: nx.DiGraph) -> nx.DiGraph:
    """
    Score every node in the graph. Modifies G in-place, returns it.
    Call this AFTER build_graph() has finished the full BFS —
    we need the complete graph to compute shortest paths.
    """
    for node_id in G.nodes:
        G.nodes[node_id]['risk_score'] = score_node(node_id, G)
    return G