/**
 * client/src/pages/Search.jsx — Week 3
 *
 * LEARNING — Polling pattern with useEffect + setInterval:
 *
 * Problem: Graph builds take 10-60s. You cannot await that in one HTTP call.
 * Solution:
 *   1. POST /api/search → server returns searchId immediately (202 Accepted)
 *   2. setInterval polls GET /api/search/:id every 2s
 *   3. When status === 'complete' → clearInterval, show results
 *   4. When status === 'failed'   → clearInterval, show error
 *
 * Key React patterns:
 *   - useRef for interval ID (not useState — changing it must NOT re-render)
 *   - useEffect cleanup: always clearInterval on unmount to prevent memory leaks
 *   - Status machine: idle → submitting → polling → complete | error
 */

import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchAPI } from '../services/api'
import Navbar from '../components/Navbar'

const STATUS_META = {
  pending:  { label: 'Queued',              color: '#718096', icon: '⏳' },
  building: { label: 'Traversing graph…',   color: '#d69e2e', icon: '🔍' },
  complete: { label: 'Complete',            color: '#38a169', icon: '✓'  },
  failed:   { label: 'Failed',              color: '#e53e3e', icon: '✗'  },
}

export default function Search() {
  const nav = useNavigate()

  const [query,    setQuery]    = useState('')
  const [maxHops,  setMaxHops]  = useState(3)
  const [phase,    setPhase]    = useState('idle')   // idle | submitting | polling | done | error
  const [searchId, setSearchId] = useState(null)
  const [status,   setStatus]   = useState(null)     // pending | building | complete | failed
  const [stats,    setStats]    = useState(null)
  const [errorMsg, setErrorMsg] = useState('')

  const intervalRef = useRef(null)  // LEARNING: useRef, not useState — changing this must NOT trigger re-render

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  // LEARNING: always clear intervals when a component unmounts.
  // Without this: if the user navigates away mid-poll, the interval keeps
  // firing, calling setState on an unmounted component → React warning + memory leak.
  useEffect(() => () => clearInterval(intervalRef.current), [])

  // ── Start polling once we have a searchId ──────────────────────────────────
  useEffect(() => {
    if (!searchId) return

    intervalRef.current = setInterval(async () => {
      try {
        const { data } = await searchAPI.status(searchId)
        setStatus(data.status)

        if (data.status === 'complete') {
          clearInterval(intervalRef.current)
          setStats(data.stats)
          setPhase('done')
        } else if (data.status === 'failed') {
          clearInterval(intervalRef.current)
          setErrorMsg(data.error || 'Graph build failed')
          setPhase('error')
        }
      } catch {
        clearInterval(intervalRef.current)
        setErrorMsg('Lost connection to server')
        setPhase('error')
      }
    }, 2000) // poll every 2 seconds

    return () => clearInterval(intervalRef.current)
  }, [searchId])

  // ── Submit handler ─────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!query.trim()) return
    setPhase('submitting'); setErrorMsg(''); setStats(null); setStatus(null)

    try {
      const { data } = await searchAPI.submit(query.trim(), maxHops)
      setSearchId(data.searchId)
      setStatus('pending')
      setPhase('polling')
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Failed to start search')
      setPhase('error')
    }
  }

  const reset = () => {
    clearInterval(intervalRef.current)
    setPhase('idle'); setQuery(''); setSearchId(null)
    setStatus(null); setStats(null); setErrorMsg('')
  }

  const sm = status ? STATUS_META[status] : null

  return (
    <div style={S.page}>
      <Navbar />
      <div style={S.container}>

        {/* ── Header ────────────────────────────────────────────────────── */}
        <div style={S.hdr}>
          <h1 style={S.h1}>Ownership Graph Search</h1>
          <p style={S.sub}>
            BFS traversal through corporate registries up to {maxHops} hops.
            Checks OpenSanctions + OFAC at every node.
          </p>
        </div>

        {/* ── Search form ───────────────────────────────────────────────── */}
        {phase === 'idle' || phase === 'error' ? (
          <form onSubmit={handleSubmit} style={S.form}>
            <input
              style={S.input}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="e.g. Rusal Trading, Mahan Air, Viktor Vekselberg"
              autoFocus
            />
            <div style={S.row}>
              <label style={S.hopsLabel}>
                Hops:
                <select style={S.hopsSelect} value={maxHops}
                  onChange={e => setMaxHops(Number(e.target.value))}>
                  {[1,2,3,4,5].map(n => (
                    <option key={n} value={n}>{n} {n===3?'(default)':''}</option>
                  ))}
                </select>
              </label>
              <button style={S.btn} type="submit">Build graph</button>
            </div>
            {phase === 'error' && (
              <div style={S.errBox}>{errorMsg}</div>
            )}
          </form>
        ) : null}

        {/* ── Polling status ────────────────────────────────────────────── */}
        {(phase === 'polling' || phase === 'submitting') && sm && (
          <div style={S.statusCard}>
            <div style={S.statusTop}>
              <span style={{ fontSize: 28 }}>{sm.icon}</span>
              <div>
                <div style={{ ...S.statusLabel, color: sm.color }}>{sm.label}</div>
                <div style={S.statusSub}>
                  {status === 'building'
                    ? 'Traversing ownership registries and checking sanctions at each node…'
                    : 'Job queued — worker will pick it up shortly…'}
                </div>
              </div>
            </div>
            <div style={S.progressTrack}>
              <div style={{
                ...S.progressBar,
                width: status === 'pending' ? '15%' : '65%',
                background: sm.color,
                transition: 'width 1.5s ease',
              }} />
            </div>
            <div style={S.queryBadge}>Searching: <strong>{query}</strong> · {maxHops} hops · polling every 2s</div>
          </div>
        )}

        {/* ── Results ───────────────────────────────────────────────────── */}
        {phase === 'done' && stats && (
          <div style={S.resultCard}>
            <div style={S.resultHeader}>
              <div>
                <div style={S.resultTitle}>Graph built: <span style={S.querySpan}>{query}</span></div>
                <div style={S.resultSub}>{maxHops}-hop ownership traversal complete</div>
              </div>
              <div style={{
                ...S.riskBall,
                background: stats.overallRisk >= 70 ? '#e53e3e' :
                            stats.overallRisk >= 30 ? '#dd6b20' : '#38a169',
              }}>
                <div style={S.riskNum}>{stats.overallRisk}</div>
                <div style={S.riskLbl}>risk</div>
              </div>
            </div>

            <div style={S.statsGrid}>
              {[
                { label: 'Total entities', value: stats.nodeCount,       color: '#58a6ff' },
                { label: 'Sanctioned',     value: stats.sanctionedCount, color: '#f85149' },
                { label: 'High risk',      value: stats.highRiskCount,   color: '#d29922' },
                { label: 'Connections',    value: stats.edgeCount,       color: '#3fb950' },
              ].map(s => (
                <div key={s.label} style={S.statBox}>
                  <div style={{ ...S.statNum, color: s.color }}>{s.value}</div>
                  <div style={S.statLabel}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={S.resultActions}>
              <button style={S.primaryBtn}
                onClick={() => nav(`/graph/${searchId}`)}>
                View graph →
              </button>
              <button style={S.secondaryBtn} onClick={reset}>
                New search
              </button>
            </div>

            {stats.sanctionedCount > 0 && (
              <div style={S.alertBox}>
                ⚠ {stats.sanctionedCount} sanctioned {stats.sanctionedCount === 1 ? 'entity' : 'entities'} found
                in the ownership chain. Proceed to graph view for details.
              </div>
            )}
          </div>
        )}

        {/* ── History ───────────────────────────────────────────────────── */}
        {phase === 'idle' && <SearchHistory onSelect={id => nav(`/graph/${id}`)} />}

      </div>
    </div>
  )
}

// ── Search History sub-component ──────────────────────────────────────────────
function SearchHistory({ onSelect }) {
  const [history, setHistory] = useState([])
  useEffect(() => {
    searchAPI.history()
      .then(({ data }) => setHistory(data.searches || []))
      .catch(() => {})
  }, [])

  if (!history.length) return null

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ fontSize: 12, color: '#718096', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>
        Recent searches
      </div>
      {history.slice(0, 5).map(s => (
        <div key={s._id} style={S.historyRow} onClick={() => s.status === 'complete' && onSelect(s._id)}>
          <div>
            <div style={{ fontSize: 14, color: '#e6edf3', fontWeight: 500 }}>{s.seedName}</div>
            <div style={{ fontSize: 12, color: '#718096' }}>
              {s.nodeCount} entities · risk {s.overallRisk}
            </div>
          </div>
          <div style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 99,
            background: s.status === 'complete' ? '#1a3320' : '#2d1a1a',
            color: s.status === 'complete' ? '#3fb950' : '#f85149',
          }}>
            {s.status}
          </div>
        </div>
      ))}
    </div>
  )
}

const S = {
  page:        { minHeight: '100vh', background: '#0f1117' },
  container:   { maxWidth: 680, margin: '0 auto', padding: '2rem 1rem' },
  hdr:         { marginBottom: '1.75rem' },
  h1:          { fontSize: 24, fontWeight: 600, color: '#e6edf3', marginBottom: 6 },
  sub:         { fontSize: 13, color: '#8b949e', lineHeight: 1.6 },
  form:        { display: 'flex', flexDirection: 'column', gap: 10 },
  input:       { padding: '12px 14px', background: '#161b22', border: '1px solid #30363d', borderRadius: 8, fontSize: 14, color: '#e6edf3', outline: 'none' },
  row:         { display: 'flex', gap: 10, alignItems: 'center' },
  hopsLabel:   { fontSize: 13, color: '#8b949e', display: 'flex', alignItems: 'center', gap: 6 },
  hopsSelect:  { background: '#161b22', border: '1px solid #30363d', color: '#e6edf3', borderRadius: 6, padding: '6px 8px', fontSize: 13 },
  btn:         { marginLeft: 'auto', padding: '10px 22px', background: '#1f6feb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' },
  errBox:      { background: '#2d1a1a', border: '1px solid #f85149', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#f85149' },
  statusCard:  { background: '#161b22', border: '1px solid #30363d', borderRadius: 10, padding: '1.5rem' },
  statusTop:   { display: 'flex', gap: 14, alignItems: 'center', marginBottom: 16 },
  statusLabel: { fontSize: 16, fontWeight: 600, marginBottom: 4 },
  statusSub:   { fontSize: 13, color: '#8b949e', lineHeight: 1.5 },
  progressTrack: { height: 4, background: '#30363d', borderRadius: 2, overflow: 'hidden', marginBottom: 12 },
  progressBar:   { height: '100%', borderRadius: 2 },
  queryBadge:  { fontSize: 12, color: '#8b949e' },
  resultCard:  { background: '#161b22', border: '1px solid #30363d', borderRadius: 10, padding: '1.5rem' },
  resultHeader:{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  resultTitle: { fontSize: 16, fontWeight: 600, color: '#e6edf3', marginBottom: 4 },
  querySpan:   { color: '#58a6ff' },
  resultSub:   { fontSize: 12, color: '#8b949e' },
  riskBall:    { width: 60, height: 60, borderRadius: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  riskNum:     { fontSize: 22, fontWeight: 700, color: '#fff', lineHeight: 1 },
  riskLbl:     { fontSize: 10, color: 'rgba(255,255,255,.7)' },
  statsGrid:   { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 },
  statBox:     { background: '#0f1117', borderRadius: 8, padding: '12px 10px', textAlign: 'center' },
  statNum:     { fontSize: 26, fontWeight: 700, lineHeight: 1, marginBottom: 4 },
  statLabel:   { fontSize: 11, color: '#8b949e' },
  resultActions: { display: 'flex', gap: 10, marginBottom: 12 },
  primaryBtn:  { padding: '10px 22px', background: '#1f6feb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' },
  secondaryBtn:{ padding: '10px 22px', background: 'transparent', color: '#8b949e', border: '1px solid #30363d', borderRadius: 8, fontSize: 14, cursor: 'pointer' },
  alertBox:    { background: '#2d1a1a', border: '1px solid #f85149', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#fca5a5' },
  historyRow:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: '#161b22', border: '1px solid #30363d', borderRadius: 8, marginBottom: 8, cursor: 'pointer' },
}