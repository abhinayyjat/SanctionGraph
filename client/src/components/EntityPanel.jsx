/**
 * client/src/components/EntityPanel.jsx — Week 4
 *
 * LEARNING — Derived state vs stored state:
 * We compute riskLevel, badgeColor, etc. from props on every render.
 * We do NOT store them in useState. They're derived from node.risk_score.
 *
 * Why? Derived state is always in sync with props. Stored derived state
 * goes stale (you click a different node → props change → but stored
 * state still shows the old node's badge). Never duplicate state.
 */

const risk = (score) => {
  if (score >= 100) return { label: 'SANCTIONED', bg: '#2d1a1a', color: '#f85149', border: '#f85149' }
  if (score >= 70)  return { label: 'HIGH RISK',  bg: '#2d1e0a', color: '#d29922', border: '#d29922' }
  if (score >= 30)  return { label: 'MEDIUM',     bg: '#2d2200', color: '#d29922', border: '#553c00' }
  return                   { label: 'CLEAN',       bg: '#0d2a1a', color: '#3fb950', border: '#3fb950' }
}

export default function EntityPanel({ node, onClose }) {
  if (!node) return null

  const r     = risk(node.risk_score || 0)
  const score = node.risk_score || 0

  return (
    <div style={S.panel}>
      {/* Header */}
      <div style={S.header}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ ...S.badge, background: r.bg, color: r.color, borderColor: r.border }}>
            {r.label}
          </div>
          <div style={S.name}>{node.name || '—'}</div>
        </div>
        <button style={S.close} onClick={onClose}>✕</button>
      </div>

      {/* Risk score bar */}
      <div style={S.scoreRow}>
        <span style={S.scoreLabel}>Risk score</span>
        <span style={{ ...S.scoreNum, color: r.color }}>{score}</span>
      </div>
      <div style={S.track}>
        <div style={{ ...S.fill, width: `${score}%`, background: r.color }} />
      </div>

      {/* Fields */}
      <div style={S.fields}>
        {[
          ['Type',         node.type         || 'Unknown'],
          ['Jurisdiction', node.jurisdiction  || 'Unknown'],
          ['Status',       node.status        || 'Unknown'],
          ['Hops from seed', node.depth ?? '—'],
          ['Officers',     node.officer_count ?? '—'],
          ['Filings',      node.filing_count  ?? '—'],
        ].map(([k, v]) => (
          <div key={k} style={S.field}>
            <span style={S.fkey}>{k}</span>
            <span style={S.fval}>{String(v)}</span>
          </div>
        ))}
      </div>

      {/* Sanctions sources */}
      {node.sanctioned && node.sanctions_sources?.length > 0 && (
        <div style={S.section}>
          <div style={S.sectionLabel}>Listed on</div>
          <div style={S.chips}>
            {node.sanctions_sources.map(s => (
              <span key={s} style={S.chip}>{s.replace(/_/g,' ')}</span>
            ))}
          </div>
        </div>
      )}

      {/* ICIJ hit */}
      {node.in_icij && (
        <div style={S.icijBox}>
          📂 Found in ICIJ Offshore Leaks database
          {node.icij_datasets?.length > 0 && (
            <span style={S.icijDs}> ({node.icij_datasets.join(', ').replace(/_/g,' ')})</span>
          )}
        </div>
      )}

      {/* Registered agent flag */}
      {node.registered_agent && (
        <div style={S.flagBox}>⚠ Uses registered agent address — shell company indicator</div>
      )}
    </div>
  )
}

const S = {
  panel:  { position:'absolute', top:16, right:16, width:280, background:'#161b22', border:'1px solid #30363d', borderRadius:10, padding:'1rem', zIndex:50, maxHeight:'calc(100vh - 120px)', overflowY:'auto' },
  header: { display:'flex', gap:8, alignItems:'flex-start', marginBottom:10 },
  badge:  { display:'inline-block', fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:4, border:'1px solid', marginBottom:5, letterSpacing:'.04em' },
  name:   { fontSize:14, fontWeight:600, color:'#e6edf3', lineHeight:1.3, wordBreak:'break-word' },
  close:  { background:'transparent', border:'none', color:'#4a5568', fontSize:16, cursor:'pointer', flexShrink:0, marginTop:2 },
  scoreRow:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 },
  scoreLabel:{ fontSize:11, color:'#8b949e', textTransform:'uppercase', letterSpacing:'.05em' },
  scoreNum:  { fontSize:16, fontWeight:700 },
  track:  { height:4, background:'#21262d', borderRadius:2, overflow:'hidden', marginBottom:12 },
  fill:   { height:'100%', borderRadius:2, transition:'width .3s' },
  fields: { display:'flex', flexDirection:'column', gap:6, marginBottom:10 },
  field:  { display:'flex', justifyContent:'space-between', alignItems:'center' },
  fkey:   { fontSize:11, color:'#8b949e' },
  fval:   { fontSize:12, color:'#c9d1d9', fontWeight:500, textAlign:'right', maxWidth:160, wordBreak:'break-word' },
  section:{ marginBottom:10 },
  sectionLabel:{ fontSize:10, color:'#8b949e', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:5 },
  chips:  { display:'flex', flexWrap:'wrap', gap:4 },
  chip:   { fontSize:10, background:'#21262d', border:'1px solid #30363d', padding:'2px 7px', borderRadius:99, color:'#8b949e' },
  icijBox:{ background:'#1a1a2d', border:'1px solid #3a3a7a', borderRadius:6, padding:'7px 10px', fontSize:11, color:'#8888dd', marginBottom:8 },
  icijDs: { color:'#5555aa' },
  flagBox:{ background:'#2d2200', border:'1px solid #553c00', borderRadius:6, padding:'7px 10px', fontSize:11, color:'#d29922' },
}