/**
 * client/src/pages/SanctionsCheck.jsx — Week 2
 *
 * LEARNING — React patterns used here:
 *   useState:   form input, loading state, result data
 *   useRef:     access the input DOM node (for focus after submit)
 *   Conditional rendering: show result card only when data exists
 *   Derived state: riskColor computed from result, not stored separately
 *
 * UI pattern: optimistic loading state — disable button + show spinner
 * immediately on submit so the user knows something is happening.
 */

import { useState, useRef } from 'react'
import { searchAPI } from '../services/api'  // will be added to api.js
import { sanctionAPI } from '../services/api'
import Navbar from '../components/Navbar'

const RISK_CONFIG = {
  CRITICAL: { bg: '#fff5f5', border: '#fc8181', badge: '#e53e3e', label: '⚠ SANCTIONED',    text: '#742a2a' },
  HIGH:     { bg: '#fffaf0', border: '#f6ad55', badge: '#dd6b20', label: '⚡ HIGH RISK',      text: '#7b341e' },
  CLEAR:    { bg: '#f0fff4', border: '#68d391', badge: '#38a169', label: '✓ NO MATCH FOUND', text: '#22543d' },
}

export default function SanctionsCheck() {
  const [query,   setQuery]   = useState('')
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState(null)
  const [error,   setError]   = useState('')
  const inputRef = useRef(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!query.trim()) return
    setLoading(true); setError(''); setResult(null)

    try {
      const { data } = await sanctionAPI.check(query.trim())
      setResult(data)
    } catch (err) {
      setError(err.response?.data?.message || 'Check failed — is the ML service running?')
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  const cfg = result ? RISK_CONFIG[result.risk_level] || RISK_CONFIG.CLEAR : null

  return (
    <div style={S.page}>
      <Navbar />
      <div style={S.container}>
        <div style={S.header}>
          <h1 style={S.h1}>Sanctions Check</h1>
          <p style={S.sub}>Enter a company or person name to check against OFAC SDN + OpenSanctions (100+ lists)</p>
        </div>

        {/* ── Search form ─────────────────────────────────────────────── */}
        <form onSubmit={handleSubmit} style={S.form}>
          <input
            ref={inputRef}
            style={S.input}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="e.g. Rusal Trading, Viktor Vekselberg, Mahan Air"
            autoFocus
          />
          <button style={{ ...S.btn, opacity: loading ? 0.7 : 1 }} disabled={loading} type="submit">
            {loading ? 'Checking…' : 'Check'}
          </button>
        </form>

        {error && <div style={S.errBox}>{error}</div>}

        {/* ── Result card ─────────────────────────────────────────────── */}
        {result && cfg && (
          <div style={{ ...S.resultCard, background: cfg.bg, borderColor: cfg.border }}>

            {/* Risk badge */}
            <div style={{ ...S.badge, background: cfg.badge }}>
              {cfg.label}
            </div>

            {/* Entity info */}
            <div style={S.entityRow}>
              <div>
                <div style={S.entityName}>{result.entity.name}</div>
                <div style={S.entityMeta}>
                  {result.entity.jurisdiction && `${result.entity.jurisdiction} · `}
                  {result.entity.type}
                  {result.entity.from_cache && ' · from cache'}
                  {result.entity.match_score < 100 && ` · ${result.entity.match_score}% name match`}
                </div>
              </div>
              <div style={{ ...S.scoreBox, color: cfg.text, borderColor: cfg.border }}>
                <div style={S.scoreNum}>{result.sanctions.score}</div>
                <div style={S.scoreLabel}>score</div>
              </div>
            </div>

            {/* Sanctions sources */}
            {result.sanctions.direct_hit && (
              <div style={S.sourcesRow}>
                <span style={S.sourcesLabel}>Listed on:</span>
                {result.sanctions.sources.map(s => (
                  <span key={s} style={S.sourceChip}>{s.replace(/_/g, ' ')}</span>
                ))}
              </div>
            )}

            {/* Details if available */}
            {result.sanctions.details && (
              <div style={S.details}>
                {Object.entries(result.sanctions.details)
                  .filter(([,v]) => v)
                  .map(([k, v]) => (
                    <div key={k} style={S.detailRow}>
                      <span style={S.detailKey}>{k.replace(/_/g,' ')}</span>
                      <span style={S.detailVal}>{String(v)}</span>
                    </div>
                  ))
                }
              </div>
            )}

            {/* Prompt to run full graph search */}
            {!result.sanctions.direct_hit && (
              <div style={S.graphPrompt}>
                No direct hit. Run a full ownership graph search in Week 3 to check indirect exposure.
              </div>
            )}
          </div>
        )}

        {/* ── Quick examples ───────────────────────────────────────────── */}
        {!result && !loading && (
          <div style={S.examples}>
            <div style={S.examplesLabel}>Try an example:</div>
            {['Rusal', 'Mahan Air', 'ZTFE Bank', 'Apple Inc'].map(n => (
              <button key={n} style={S.exampleBtn} onClick={() => { setQuery(n); }}>
                {n}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const S = {
  page:       { minHeight: '100vh', background: '#f7fafc' },
  container:  { maxWidth: 640, margin: '0 auto', padding: '2rem 1rem' },
  header:     { marginBottom: '1.5rem' },
  h1:         { fontSize: 24, fontWeight: 600, color: '#1a202c', marginBottom: 6 },
  sub:        { fontSize: 13, color: '#718096', lineHeight: 1.5 },
  form:       { display: 'flex', gap: 8, marginBottom: 16 },
  input:      { flex: 1, padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', background: '#fff' },
  btn:        { padding: '10px 20px', background: '#2b6cb0', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' },
  errBox:     { background: '#fff5f5', border: '1px solid #fc8181', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#c53030', marginBottom: 16 },
  resultCard: { border: '1.5px solid', borderRadius: 10, padding: '1.25rem', marginBottom: 16 },
  badge:      { display: 'inline-block', color: '#fff', fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 99, marginBottom: 12, letterSpacing: '.04em' },
  entityRow:  { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  entityName: { fontSize: 18, fontWeight: 600, color: '#1a202c', marginBottom: 4 },
  entityMeta: { fontSize: 12, color: '#718096' },
  scoreBox:   { textAlign: 'center', border: '1.5px solid', borderRadius: 8, padding: '6px 14px', minWidth: 60 },
  scoreNum:   { fontSize: 22, fontWeight: 700 },
  scoreLabel: { fontSize: 10, color: '#718096' },
  sourcesRow: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 10 },
  sourcesLabel: { fontSize: 12, color: '#4a5568', fontWeight: 500 },
  sourceChip: { fontSize: 11, background: '#fff', border: '1px solid #e2e8f0', padding: '2px 8px', borderRadius: 99, color: '#4a5568' },
  details:    { background: 'rgba(0,0,0,.03)', borderRadius: 6, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 },
  detailRow:  { display: 'flex', gap: 8, fontSize: 12 },
  detailKey:  { color: '#718096', textTransform: 'capitalize', minWidth: 90 },
  detailVal:  { color: '#2d3748', fontWeight: 500 },
  graphPrompt:{ marginTop: 10, fontSize: 12, color: '#718096', fontStyle: 'italic' },
  examples:   { marginTop: 24 },
  examplesLabel: { fontSize: 12, color: '#a0aec0', marginBottom: 8 },
  exampleBtn: { margin: '0 6px 6px 0', padding: '5px 12px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, color: '#4a5568', cursor: 'pointer' },
}
