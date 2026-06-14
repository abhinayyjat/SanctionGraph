/**
 * server/routes/sanctions.js — Week 2
 *
 * LEARNING — Route design for a two-service architecture:
 * The browser never talks to Python directly.
 * Flow: React → Node.js → Python → response back up the chain.
 *
 * Why not let React call Python directly?
 *   1. Auth: Node.js verifies JWT before the Python call happens
 *   2. Security: Python service is on an internal Docker network, not exposed
 *   3. Control: Node.js can add logging, rate-limiting, caching before forwarding
 *   4. Flexibility: swap the ML service without changing the frontend API contract
 */

const express    = require('express');
const auth       = require('../middleware/auth');
const mlService  = require('../services/mlService');
const Entity     = require('../models/Entity');

const router = express.Router();

// ── POST /api/sanctions/check ─────────────────────────────────────────────────
// Quick sanctions check — does NOT build the full graph (that's Week 3)
router.post('/check', auth, async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name || name.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Name is required (min 2 chars)' });
    }

    const trimmed = name.trim();

    // Step 1: Resolve the entity (fuzzy match → canonical name + metadata)
    // LEARNING: We resolve first so the sanctions check uses the best-known
    // form of the name, not whatever the user typed (which may be abbreviated)
    const resolved = await mlService.resolveEntity(trimmed);

    // Step 2: Check sanctions with the resolved canonical name
    const sanctionsResult = await mlService.checkSanctions(resolved.name || trimmed);

    // Step 3: Cache the entity in MongoDB if it came from an API (not cache)
    // This ensures the next search for the same entity is instant
    if (!resolved.from_cache && resolved.name) {
      const normalize = (s) => s.toLowerCase().replace(/[.,\-'"()&]/g, ' ').replace(/\s+/g, ' ').trim();
      await Entity.findOneAndUpdate(
        { normalizedName: normalize(resolved.name) },
        {
          name:            resolved.name,
          normalizedName:  normalize(resolved.name),
          entityType:      resolved.entity_type || 'unknown',
          jurisdiction:    resolved.jurisdiction || '',
          onSanctionsList: sanctionsResult.direct_hit,
          sanctionsSources: sanctionsResult.sources || [],
          cachedAt:        new Date(),
        },
        { upsert: true, new: true }
      );
    }

    // Step 4: Return combined result to the frontend
    res.json({
      success: true,
      query:   trimmed,
      entity: {
        name:         resolved.name || trimmed,
        jurisdiction: resolved.jurisdiction || 'Unknown',
        type:         resolved.entity_type || 'unknown',
        match_score:  resolved.match_score,
        from_cache:   resolved.from_cache,
      },
      sanctions: {
        direct_hit: sanctionsResult.direct_hit,
        score:      sanctionsResult.score,
        sources:    sanctionsResult.sources || [],
        details:    sanctionsResult.details || null,
      },
      // Overall risk based on sanctions alone (graph risk comes in Week 3)
      risk_level: sanctionsResult.direct_hit ? 'CRITICAL' :
                  sanctionsResult.score >= 50 ? 'HIGH' : 'CLEAR',
    });

  } catch (err) { next(err); }
});

// ── GET /api/sanctions/cached ─────────────────────────────────────────────────
// List entities we've already checked and cached — useful for dashboard
router.get('/cached', auth, async (req, res, next) => {
  try {
    const entities = await Entity
      .find({})
      .select('name jurisdiction entityType onSanctionsList sanctionsSources cachedAt')
      .sort({ cachedAt: -1 })
      .limit(50);
    res.json({ success: true, count: entities.length, entities });
  } catch (err) { next(err); }
});

// ── GET /api/sanctions/stats ──────────────────────────────────────────────────
// Quick aggregate stats for the dashboard
router.get('/stats', auth, async (req, res, next) => {
  try {
    const [total, sanctioned, byJurisdiction] = await Promise.all([
      Entity.countDocuments(),
      Entity.countDocuments({ onSanctionsList: true }),
      Entity.aggregate([
        { $group: { _id: '$jurisdiction', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
    ]);
    res.json({ success: true, stats: { total, sanctioned, byJurisdiction } });
  } catch (err) { next(err); }
});

module.exports = router;
