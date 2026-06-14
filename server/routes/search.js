/**
 * LEARNING — The core search route using Bull job queue
 *
 * Bull is a Redis-backed job queue for Node.js.
 * Key concepts:
 *   - Queue: a list of jobs waiting to be processed
 *   - Producer: adds jobs to the queue (this file)
 *   - Consumer/Worker: picks up jobs and processes them (jobs/graphWorker.js)
 *   - Job: a unit of work with an ID, data, and status
 *
 * Why not just await the Python call directly?
 *   → A graph search takes 10–60s and makes 100+ API calls.
 *   → HTTP connections timeout (usually 30s for load balancers).
 *   → Bull persists jobs in Redis — if the server restarts mid-job, the job retries.
 *   → You can run multiple workers in parallel for scale.
 */

const express      = require('express');
const Bull         = require('bull');
const auth         = require('../middleware/auth');
const SearchResult = require('../models/SearchResult');
const mlService    = require('../services/mlService');

const router = express.Router();

// Create the Bull queue — it connects to Redis automatically using REDIS_URL
// LEARNING: The queue name 'graph-search' is just a string identifier.
// If you have multiple worker processes, they ALL connect to the same queue name.
const graphQueue = new Bull('graph-search', process.env.REDIS_URL);

// ── POST /api/search ───────────────────────────────────────────────────────
// Submit a new entity search
router.post('/', auth, async (req, res, next) => {
  try {
    const { entityName, maxHops = 3 } = req.body;
    if (!entityName || entityName.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Entity name is required' });
    }

    // 1. Create a SearchResult document in MongoDB with status='pending'
    const search = await SearchResult.create({
      user:     req.user._id,
      seedName: entityName.trim(),
      maxHops:  Math.min(maxHops, 5), // cap at 5 hops (can get very large)
    });

    // 2. Add a job to Bull queue
    // LEARNING: Bull stores the job in Redis.
    // The worker (graphWorker.js) will pick it up and call the Python service.
    const job = await graphQueue.add(
      { searchId: search._id.toString(), entityName: entityName.trim(), maxHops },
      {
        attempts: 2,           // retry once if it fails
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: 100, // keep last 100 completed jobs in Redis
        removeOnFail: 50,
      }
    );

    // 3. Save Bull job ID so we can reference it later
    await SearchResult.findByIdAndUpdate(search._id, { bullJobId: job.id.toString() });

    // 4. Return IMMEDIATELY — don't wait for the graph to build
    res.status(202).json({   // 202 Accepted = "we got it, it's processing"
      success: true,
      searchId: search._id,
      message: 'Graph build started. Poll /api/search/:searchId for status.',
    });

  } catch (err) { next(err); }
});

// ── GET /api/search/:searchId ──────────────────────────────────────────────
// Poll for search status + result
router.get('/:searchId', auth, async (req, res, next) => {
  try {
    const search = await SearchResult
      .findOne({ _id: req.params.searchId, user: req.user._id })
      .select('-graphData'); // exclude graphData for polling — it's large, fetched separately

    if (!search) return res.status(404).json({ success: false, message: 'Search not found' });

    res.json({
      success: true,
      status:  search.status,
      stats: {
        nodeCount:       search.nodeCount,
        edgeCount:       search.edgeCount,
        sanctionedCount: search.sanctionedCount,
        highRiskCount:   search.highRiskCount,
        overallRisk:     search.overallRisk,
      },
      error: search.error || null,
    });

  } catch (err) { next(err); }
});

// ── GET /api/search/:searchId/graph ───────────────────────────────────────
// Fetch the full graph data (only call this once status='complete')
router.get('/:searchId/graph', auth, async (req, res, next) => {
  try {
    const search = await SearchResult.findOne({ _id: req.params.searchId, user: req.user._id });
    if (!search) return res.status(404).json({ success: false, message: 'Search not found' });
    if (search.status !== 'complete') {
      return res.status(400).json({ success: false, message: `Graph not ready — status: ${search.status}` });
    }
    res.json({ success: true, graphData: search.graphData });

  } catch (err) { next(err); }
});

// ── GET /api/search (history) ─────────────────────────────────────────────
router.get('/', auth, async (req, res, next) => {
  try {
    const searches = await SearchResult
      .find({ user: req.user._id })
      .select('-graphData -report')
      .sort({ createdAt: -1 })
      .limit(20);
    res.json({ success: true, searches });
  } catch (err) { next(err); }
});

// ── Export queue so the worker can use the same instance ──────────────────
// LEARNING: Bull workers process jobs — they listen on the same Redis queue.
// We export graphQueue here so jobs/graphWorker.js can call graphQueue.process()
module.exports = { router, graphQueue };