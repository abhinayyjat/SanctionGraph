/**
 * LEARNING — Bull Worker (Consumer)
 *
 * This file runs as a separate process or is imported at startup.
 * graphQueue.process() registers a handler — Bull calls it whenever
 * a job is available in the Redis queue.
 *
 * The handler receives the job object with job.data (what we passed in graphQueue.add()).
 * It should:
 *   1. Do the actual work (call Python service)
 *   2. Update the SearchResult in MongoDB
 *   3. Throw if something fails (Bull will retry)
 */

const SearchResult = require('../models/SearchResult');
const mlService    = require('../services/mlService');

// Import the same queue instance from the routes file
// This connects to the same Redis queue and starts consuming jobs
const { graphQueue } = require('../routes/search');

// LEARNING: graphQueue.process(concurrency, handler)
// concurrency = 2 means process 2 jobs simultaneously (2 graph builds at once)
graphQueue.process(2, async (job) => {
  const { searchId, entityName, maxHops } = job.data;
  console.log(`[Worker] Starting graph build for "${entityName}" (${searchId})`);

  try {
    // Update status to 'building' so the frontend shows a progress state
    await SearchResult.findByIdAndUpdate(searchId, { status: 'building' });

    // Call Python ML service — this is the long-running call (10–60s)
    const graphData = await mlService.buildGraph(entityName, maxHops);

    // Compute aggregate stats from graph data
    const nodes          = graphData.nodes || [];
    const sanctionedCount = nodes.filter(n => n.data?.sanctioned).length;
    const highRiskCount   = nodes.filter(n => (n.data?.risk_score || 0) >= 70).length;
    const overallRisk     = nodes.length > 0
      ? Math.round(nodes.reduce((sum, n) => sum + (n.data?.risk_score || 0), 0) / nodes.length)
      : 0;

    // Save full graph + stats
    await SearchResult.findByIdAndUpdate(searchId, {
      status:   'complete',
      graphData,
      nodeCount:       nodes.length,
      edgeCount:       (graphData.links || []).length,
      sanctionedCount,
      highRiskCount,
      overallRisk,
    });

    console.log(`[Worker] Complete: ${nodes.length} nodes, risk=${overallRisk}`);

  } catch (err) {
    console.error(`[Worker] Failed for ${searchId}:`, err.message);
    // Mark as failed in DB so frontend shows error state
    await SearchResult.findByIdAndUpdate(searchId, { status: 'failed', error: err.message });
    throw err; // re-throw so Bull records the failure and can retry
  }
});

// LEARNING: Bull emits events you can listen to for monitoring/debugging
graphQueue.on('completed', (job) => console.log(`[Bull] Job ${job.id} completed`));
graphQueue.on('failed',    (job, err) => console.error(`[Bull] Job ${job.id} failed:`, err.message));

console.log('✓ Graph worker listening for jobs...');