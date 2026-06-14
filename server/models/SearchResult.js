/**
 * LEARNING — Async job pattern with status polling.
 *
 * A graph search takes 10–60 seconds. You cannot hold an HTTP connection open
 * that long — browsers timeout, load balancers kill it, users get confused.
 *
 * The pattern we use:
 * 1. POST /api/search → create this document with status='pending',
 *                       add job to Bull queue, return { searchId }
 * 2. Worker (Bull) picks up job, updates status='building', runs BFS
 * 3. When done, updates status='complete', stores graphData
 * 4. Frontend polls GET /api/search/:searchId every 2 seconds
 * 5. When status='complete', frontend renders the graph
 *
 * This is called the Polling pattern. Alternatives: WebSockets, Server-Sent Events.
 * For an interview, explain why you chose polling vs WebSockets:
 *   → Polling is simpler, works behind all proxies and firewalls,
 *     good enough when latency > 5s (which it is here).
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const SearchResultSchema = new Schema({
  user:        { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  seedName:    { type: String, required: true },   // what the user typed
  seedEntityId: String,                            // resolved entity ID
  maxHops:     { type: Number, default: 3 },

  // The full graph in NetworkX node-link format:
  // { nodes: [{id, name, riskScore, ...}], links: [{source, target, relationship}] }
  graphData: Schema.Types.Mixed,

  // Aggregate stats (computed after graph build — for quick display without parsing graphData)
  nodeCount:       { type: Number, default: 0 },
  edgeCount:       { type: Number, default: 0 },
  sanctionedCount: { type: Number, default: 0 },
  highRiskCount:   { type: Number, default: 0 },
  overallRisk:     { type: Number, min: 0, max: 100, default: 0 },

  // Status machine: pending → building → complete | failed
  status:    { type: String, enum: ['pending','building','complete','failed'], default: 'pending', index: true },
  error:     String,     // populated if status='failed'

  // LLM-generated compliance narrative (populated by POST /reports/:searchId)
  report:    String,
  reportGeneratedAt: Date,

  // Bull job ID (so we can check job status directly if needed)
  bullJobId: String,
}, { timestamps: true });

module.exports = mongoose.model('SearchResult', SearchResultSchema);
