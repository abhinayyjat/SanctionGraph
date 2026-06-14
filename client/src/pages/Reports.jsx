/**
 * client/src/pages/Reports.jsx — Week 4
 *
 * LEARNING — useEffect dependency array:
 * useEffect(() => { fetch() }, [])   → runs once on mount
 * useEffect(() => { fetch() }, [id]) → re-runs when id changes
 * useEffect(() => { fetch() })       → runs on every render (usually wrong)
 *
 * Here we fetch once ([]) because the reports list doesn't
 * depend on any changing value — it's always "all my reports".
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { reportAPI } from '../services/api'
import Navbar from '../components/Navbar'

export default function Reports() {
  const nav = useNavigate()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    reportAPI.list()
      .then(({ data }) => setReports(data.reports || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])  // empty array = run once on mount

  if (loading) return (
    <div style={S.page}><Navbar />
      <div style={S.center}><div style={S.spin} /></div>
    </div>
  )

  return (
    <div style={S.page}>
      <Navbar />
      <div style={S.container}>
        <h1 style={S.h1}>Compliance Reports</h1>
        {reports.length === 0 ? (
          <div style={S.empty}>
            <div style={{ fontSize:32, marginBottom:8 }}>📄</div>
            <div style={{ color:'#8b949e', fontSize:14 }}>No reports yet.</div>
            <div style={{ color:'#4a5568', fontSize:12, marginTop:4 }}>
              Run a graph search and click "Report" to generate one.
            </div>
            <button style={S.searchBtn} onClick={() => nav('/search')}>→ Go to search</button>
          </div>
        ) : (
          <div style={S.list}>
            {reports.map(r => (
              <div key={r._id} style={S.card}>
                <div style={S.cardTop}>
                  <div>
                    <div style={S.cardTitle}>{r.seedName}</div>
                    <div style={S.cardMeta}>
                      {new Date(r.reportGeneratedAt).toLocaleDateString()} ·{' '}
                      {r.sanctionedCount} sanctioned · Risk {r.overallRisk}
                    </div>
                  </div>
                  <div style={{
                    ...S.riskBadge,
                    background: r.overallRisk >= 70 ? '#2d1a1a' : r.overallRisk >= 30 ? '#2d2200' : '#0d2a1a',
                    color:       r.overallRisk >= 70 ? '#f85149' : r.overallRisk >= 30 ? '#d29922' : '#3fb950',
                  }}>
                    {r.overallRisk}
                  </div>
                </div>
                <pre style={S.excerpt}>
                  {r.report?.slice(0, 300)}{r.report?.length > 300 ? '…' : ''}
                </pre>
                <div style={S.cardActions}>
                  <button style={S.copyBtn}
                    onClick={() => navigator.clipboard.writeText(r.report)}>
                    Copy full report
                  </button>
                  <button style={S.graphBtn}
                    onClick={() => nav(`/graph/${r._id}`)}>
                    View graph →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const S = {
  page:      { minHeight:'100vh', background:'#0f1117' },
  center:    { display:'flex', justifyContent:'center', alignItems:'center', height:'60vh' },
  spin:      { width:36, height:36, border:'3px solid #30363d', borderTop:'3px solid #58a6ff', borderRadius:'50%', animation:'spin 1s linear infinite' },
  container: { maxWidth:720, margin:'0 auto', padding:'2rem 1rem' },
  h1:        { fontSize:22, fontWeight:600, color:'#e6edf3', marginBottom:'1.5rem' },
  empty:     { textAlign:'center', padding:'3rem 0' },
  searchBtn: { marginTop:16, padding:'8px 18px', background:'#1f6feb', color:'#fff', border:'none', borderRadius:8, fontSize:13, cursor:'pointer' },
  list:      { display:'flex', flexDirection:'column', gap:12 },
  card:      { background:'#161b22', border:'1px solid #30363d', borderRadius:10, padding:'1.25rem' },
  cardTop:   { display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 },
  cardTitle: { fontSize:16, fontWeight:600, color:'#e6edf3', marginBottom:4 },
  cardMeta:  { fontSize:12, color:'#8b949e' },
  riskBadge: { fontSize:20, fontWeight:700, padding:'6px 14px', borderRadius:8, border:'1px solid currentColor' },
  excerpt:   { fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:'#8b949e', background:'#0f1117', borderRadius:6, padding:'10px 12px', whiteSpace:'pre-wrap', marginBottom:10, lineHeight:1.6 },
  cardActions:{ display:'flex', gap:8 },
  copyBtn:   { padding:'5px 12px', background:'transparent', border:'1px solid #30363d', color:'#8b949e', borderRadius:6, fontSize:12, cursor:'pointer' },
  graphBtn:  { padding:'5px 12px', background:'#1f6feb', color:'#fff', border:'none', borderRadius:6, fontSize:12, cursor:'pointer' },
}