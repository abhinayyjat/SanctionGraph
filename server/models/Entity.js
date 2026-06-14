/**
 * LEARNING — Entity cache model.
 *
 * Every time we look up a company via OpenCorporates or OpenSanctions,
 * we save the result here with a cachedAt timestamp.
 *
 * On the next search, before hitting the API again, we check:
 *   "Is there an entity in this collection that fuzzy-matches the query
 *    AND was cached within the last 7 days?"
 *
 * If yes → use cache (free, fast)
 * If no  → call API, then save to cache
 *
 * This is called the Cache-Aside pattern (also known as Lazy Loading).
 * It's one of the most important patterns in system design interviews.
 */

const mongoose = require('mongoose');

const EntitySchema = new mongoose.Schema({
  // IDs from external sources (may not always have all three)
  opencorporatesId: String,
  opensanctionsId:  String,
  icijId:           String,

  name:           { type: String, required: true, index: true },
  normalizedName: { type: String, index: true },  // lowercase, stripped suffixes (for fuzzy pre-filter)

  entityType:     { type: String, enum: ['company', 'person', 'vessel', 'aircraft', 'unknown'], default: 'unknown' },
  jurisdiction:   String,  // ISO 3166-1 alpha-2 country code e.g. 'RU', 'AE', 'GB'
  incorporationDate: Date,
  status:         String,  // 'active' | 'dissolved' | 'unknown'

  // Officers and shareholders — populated from OpenCorporates
  officerCount:   { type: Number, default: 0 },
  filingCount:    { type: Number, default: 0 },
  usesRegisteredAgent: { type: Boolean, default: false },

  // Sanctions data
  onSanctionsList: { type: Boolean, default: false, index: true },
  sanctionsSources: [String],  // e.g. ['OFAC_SDN', 'EU_CONSOLIDATED', 'UN_SC']

  // ICIJ Offshore Leaks database (Panama Papers, Pandora Papers, FinCEN Files)
  inIcijDatabase: { type: Boolean, default: false },
  icijDatasets:   [String],    // e.g. ['panama_papers', 'pandora_papers']

  // LEARNING — TTL via cachedAt:
  // We use cachedAt to decide if data is stale (> 7 days).
  // MongoDB can also auto-delete documents via TTL indexes:
  //   EntitySchema.index({ cachedAt: 1 }, { expireAfterSeconds: 604800 })
  // We don't use auto-delete here because we want to keep the graph data.
  cachedAt: { type: Date, default: Date.now },

  // Raw data from APIs for reference
  rawData: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

// Compound index for efficient fuzzy pre-filtering
EntitySchema.index({ normalizedName: 1, jurisdiction: 1 });

module.exports = mongoose.model('Entity', EntitySchema);
