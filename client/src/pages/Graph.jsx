/**
 * client/src/pages/Graph.jsx — Week 4
 *
 * LEARNING — Page lifecycle for async data:
 *   1. Component mounts → show skeleton/spinner
 *   2. useEffect fires → fetch graph data from API
 *   3. Data arrives → set state → React re-renders with graph
 *
 * useParams(): reads :searchId from the URL (/graph/abc123)
 * without prop drilling. React Router injects it automatically.
 *
 * State split: graphData in this page, selectedNode in this page.
 * ForceGraph only receives graphData + a callback.
 * EntityPanel only receives selectedNode.
 * Clean separation — each component owns only what it needs.
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { searchAPI, reportAPI } from '../services/api'
import ForceGraph  from '../components/ForceGraph'
import EntityPanel from '../components/EntityPanel'
import Navbar      from '../components/Navbar'

export default function Graph() {
  const { searchId } = useParams()   // LEARNING: reads :searchId from URL
  const nav = useNavigate()

  const [graphData,     setGraphData]     = useState(null)
  const [selectedNode,  setSelectedNode]  = useState(null)
  const [search,        setSearch]        = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState('')
  const [reportLoading, setReportLoading] = useState(false)
  const [report,        setReport]        = useState('')
  const [showReport,    setShowReport]    = useState(false)
  const [filter,        setFilter]        = useState('all') // all | high | sanctioned

  useEffect(() => {
    if (!searchId) return
    let cancelled = false  // LEARNING: prevents state update on unmounted component

    const load = async () => {
      try {
        const [statusRes, graphRes] = await Promise.all([
          searchAPI.status(searchId),
          searchAPI.graph(searchId),
        ])
        if (cancelled) return
        setSearch(statusRes.data)
        setGraphData(graphRes.data.graphData)
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || 'Failed to load graph')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }  // cleanup: cancel if user navigates away
  }, [searchId])

  const generateReport = async () => {
    setReportLoading(true)
    try {
      const { data } = await reportAPI.generate(searchId)
      setReport(data.report)
      setShowReport(true)
    } catch { setReport('Report generation failed.') }
    finally  { setReportLoading(false) }
  }

  // ── Filter graph nodes by risk level ─────────────────────────────────────
  const filteredGraph = graphData ? {
    ...graphData,
    nodes: graphData.nodes.filter(n => {
      const score = n.data?.risk_score || 0
      if (filter === 'sanctioned') return n.data?.sanctioned
      if (filter === 'high')       return score >= 70
      return true
    }),
    links: graphData ? graphData.links.filter(l => {
      if (filter === 'all') return true
      const nodeIds = new Set(
        graphData.nodes
          .filter(n => filter === 'sanctioned' ? n.data?.sanctioned : (n.data?.risk_score||0) >= 70)
          .map(n => n.id)
      )
      return nodeIds.has(l.source) || nodeIds.has(l.target)
    }) : [],
  } : null

  const stats = search?.stats || {}

  if (loading) return (
    <div style={S.page}>
      <Navbar />
      <div style={S.center}><div style={S.spinner} /><p style={S.spinTxt}>Loading graph…</p></div>
    </div>
  )

  if (error) return (
    <div style={S.page}>
      <Navbar />
      <div style={S.center}>
        <div style={S.errBox}>{error}</div>
        <button style={S.backBtn} onClick={() => nav('/search')}>← Back to search</button>
      </div>
    </div>
  )

  return (
    <div style={S.page}>
      <Navbar />

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div style={S.toolbar}>
        <div style={S.toolLeft}>
          <button style={S.backBtn} onClick={() => nav('/search')}>← Search</button>
          <div style={S.seedLabel}>{search?.seedName || 'Graph'}</div>
          <div style={S.statPills}>
            {[
              { l: `${stats.nodeCount ?? graphData?.nodes?.length ?? 0} entities`, c: '#58a6ff' },
              { l: `${stats.sanctionedCount ?? 0} sanctioned`,                     c: '#f85149' },
              { l: `Risk ${stats.overallRisk ?? 0}`,                               c: stats.overallRisk >= 70 ? '#f85149' : stats.overallRisk >= 30 ? '#d29922' : '#3fb950' },
            ].map(p => (
              <span key={p.l} style={{ ...S.pill, color: p.c }}>{p.l}</span>
            ))}
          </div>
        </div>
        <div style={S.toolRight}>
          {/* Filter buttons */}
          {['all','high','sanctioned'].map(f => (
            <button key={f} style={{ ...S.filterBtn, ...(filter===f ? S.filterActive : {}) }}
              onClick={() => setFilter(f)}>
              {f === 'all' ? 'All nodes' : f === 'high' ? '⚡ High risk' : '⚠ Sanctioned'}
            </button>
          ))}
          <button style={S.reportBtn} onClick={generateReport} disabled={reportLoading}>
            {reportLoading ? 'Generating…' : '📄 Report'}
          </button>
        </div>
      </div>

      {/* ── Main canvas ──────────────────────────────────────────────────── */}
      <div style={S.canvas}>
        {filteredGraph && (
          <ForceGraph
            graphData={filteredGraph}
            onNodeClick={setSelectedNode}
            selectedNodeId={selectedNode?.id}
          />
        )}

        {/* ── Entity detail panel (slides in on node click) ───────────── */}
        {selectedNode && (
          <EntityPanel
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
          />
        )}

        {/* ── Legend ───────────────────────────────────────────────────── */}
        <div style={S.legend}>
          {[
            { c:'#e53e3e', l:'Sanctioned (100)' },
            { c:'#dd6b20', l:'High risk (≥70)'  },
            { c:'#d69e2e', l:'Medium (≥30)'      },
            { c:'#38a169', l:'Clean (<30)'        },
          ].map(({ c, l }) => (
            <div key={l} style={S.legendRow}>
              <span style={{ ...S.legendDot, background: c }} />
              <span style={S.legendTxt}>{l}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Report modal ─────────────────────────────────────────────────── */}
      {showReport && (
        <div style={S.overlay} onClick={() => setShowReport(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={S.modalHeader}>
              <h3 style={S.modalTitle}>Compliance Report</h3>
              <button style={S.closeBtn} onClick={() => setShowReport(false)}>✕</button>
            </div>
            <pre style={S.reportText}>{report}</pre>
            <button style={S.copyReportBtn}
              onClick={() => navigator.clipboard.writeText(report)}>
              Copy to clipboard
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const S = {
  page:       { minHeight:'100vh', background:'#0f1117', display:'flex', flexDirection:'column' },
  center:     { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flex:1, gap:16, padding:'2rem' },
  spinner:    { width:40, height:40, border:'3px solid #30363d', borderTop:'3px solid #58a6ff', borderRadius:'50%', animation:'spin 1s linear infinite' },
  spinTxt:    { color:'#8b949e', fontSize:14 },
  errBox:     { background:'#2d1a1a', border:'1px solid #f85149', borderRadius:8, padding:'12px 16px', color:'#fca5a5', fontSize:14 },
  toolbar:    { background:'#161b22', borderBottom:'1px solid #30363d', padding:'10px 1.5rem', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' },
  toolLeft:   { display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' },
  toolRight:  { display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' },
  backBtn:    { background:'transparent', border:'1px solid #30363d', color:'#8b949e', padding:'5px 10px', borderRadius:6, fontSize:12, cursor:'pointer' },
  seedLabel:  { fontSize:15, fontWeight:600, color:'#e6edf3' },
  statPills:  { display:'flex', gap:8 },
  pill:       { fontSize:12, background:'#0f1117', padding:'2px 8px', borderRadius:99, border:'1px solid #30363d' },
  filterBtn:  { padding:'5px 10px', background:'transparent', border:'1px solid #30363d', color:'#8b949e', borderRadius:6, fontSize:12, cursor:'pointer' },
  filterActive:{ background:'#1f6feb', borderColor:'#1f6feb', color:'#fff' },
  reportBtn:  { padding:'5px 14px', background:'#238636', border:'none', color:'#fff', borderRadius:6, fontSize:12, fontWeight:500, cursor:'pointer' },
  canvas:     { flex:1, position:'relative', overflow:'hidden' },
  legend:     { position:'absolute', bottom:16, left:16, background:'rgba(22,27,34,.9)', border:'1px solid #30363d', borderRadius:8, padding:'10px 14px', display:'flex', flexDirection:'column', gap:6 },
  legendRow:  { display:'flex', alignItems:'center', gap:8 },
  legendDot:  { width:10, height:10, borderRadius:'50%', flexShrink:0 },
  legendTxt:  { fontSize:11, color:'#8b949e' },
  overlay:    { position:'fixed', inset:0, background:'rgba(0,0,0,.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200 },
  modal:      { background:'#161b22', border:'1px solid #30363d', borderRadius:12, padding:'1.5rem', width:'100%', maxWidth:600, maxHeight:'80vh', display:'flex', flexDirection:'column', gap:12 },
  modalHeader:{ display:'flex', justifyContent:'space-between', alignItems:'center' },
  modalTitle: { fontSize:16, fontWeight:600, color:'#e6edf3' },
  closeBtn:   { background:'transparent', border:'none', color:'#8b949e', fontSize:18, cursor:'pointer' },
  reportText: { flex:1, overflow:'auto', fontFamily:"'IBM Plex Mono',monospace", fontSize:12, lineHeight:1.7, color:'#c9d1d9', whiteSpace:'pre-wrap', background:'#0f1117', borderRadius:8, padding:'1rem' },
  copyReportBtn:{ alignSelf:'flex-start', padding:'6px 14px', background:'#30363d', border:'none', color:'#e6edf3', borderRadius:6, fontSize:12, cursor:'pointer' },
}