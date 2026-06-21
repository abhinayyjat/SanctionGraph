/**
 * client/src/pages/BulkUpload.jsx — Week 5
 *
 * LEARNING — File upload in React:
 * <input type="file"> gives a FileList. We grab file[0], put it in
 * FormData (multipart/form-data), and POST it with Axios.
 * Axios automatically sets the correct Content-Type boundary header.
 * Never set Content-Type manually for multipart — let Axios do it.
 *
 * LEARNING — Papa Parse (CSV parsing in the browser):
 * We parse the CSV client-side BEFORE uploading so we can show
 * the user a preview ("18 companies found") and validate the file
 * without a round-trip to the server.
 */

import { useState, useRef } from 'react'
import axios from 'axios'
import { searchAPI } from '../services/api'
import Navbar from '../components/Navbar'

// Simple CSV parser (no library needed for single-column CSVs)
function parseCSV(text) {
  return text.split('\n')
    .map(l => l.trim().replace(/^["']|["']$/g, ''))
    .filter(l => l && l.toLowerCase() !== 'name' && l.toLowerCase() !== 'company')
}

const RISK_COLOR = { CRITICAL:'#f85149', HIGH:'#d29922', CLEAR:'#3fb950', PENDING:'#8b949e' }

export default function BulkUpload() {
  const [preview,  setPreview]  = useState([])   // parsed names before upload
  const [results,  setResults]  = useState([])   // [{name, status, risk, searchId}]
  const [phase,    setPhase]    = useState('idle') // idle | preview | running | done
  const [progress, setProgress] = useState(0)
  const [fileName, setFileName] = useState('')
  const fileRef = useRef(null)

  const onFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const names = parseCSV(ev.target.result).slice(0, 100) // cap at 100
      setPreview(names)
      setResults(names.map(name => ({ name, status: 'pending', risk: null, searchId: null })))
      setPhase('preview')
    }
    reader.readAsText(file)
  }

  const run = async () => {
    setPhase('running')
    let done = 0

    // Process in batches of 5 to avoid overwhelming the queue
    // LEARNING: Promise.all() runs promises concurrently.
    // Batching prevents 100 simultaneous API calls from hitting rate limits.
    for (let i = 0; i < preview.length; i += 5) {
      const batch = preview.slice(i, i + 5)
      await Promise.all(batch.map(async (name) => {
        try {
          const { data } = await searchAPI.submit(name, 2) // 2 hops for bulk (faster)
          setResults(prev => prev.map(r =>
            r.name === name ? { ...r, status: 'building', searchId: data.searchId } : r
          ))

          // Poll until complete
          const searchId = data.searchId
          await new Promise((resolve) => {
            const iv = setInterval(async () => {
              try {
                const { data: s } = await searchAPI.status(searchId)
                if (s.status === 'complete') {
                  setResults(prev => prev.map(r =>
                    r.name === name ? {
                      ...r, status: 'complete',
                      risk: s.stats.overallRisk,
                      sanctioned: s.stats.sanctionedCount > 0,
                      nodeCount: s.stats.nodeCount,
                    } : r
                  ))
                  clearInterval(iv); resolve()
                } else if (s.status === 'failed') {
                  setResults(prev => prev.map(r =>
                    r.name === name ? { ...r, status: 'failed' } : r
                  ))
                  clearInterval(iv); resolve()
                }
              } catch { clearInterval(iv); resolve() }
            }, 3000)
          })
        } catch {
          setResults(prev => prev.map(r =>
            r.name === name ? { ...r, status: 'failed' } : r
          ))
        }
        done++
        setProgress(Math.round((done / preview.length) * 100))
      }))
    }
    setPhase('done')
  }

  const exportCSV = () => {
    const rows = ['Name,Risk Score,Sanctioned,Entities,Status',
      ...results.map(r => `"${r.name}",${r.risk ?? ''},${r.sanctioned ? 'YES' : 'NO'},${r.nodeCount ?? ''},${r.status}`)
    ]
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = 'sanctiongraph_results.csv'; a.click()
  }

  const reset = () => { setPhase('idle'); setPreview([]); setResults([]); setProgress(0); setFileName('') }

  const highRisk = results.filter(r => r.sanctioned || (r.risk >= 70)).length

  return (
    <div style={S.page}>
      <Navbar />
      <div style={S.container}>
        <div style={S.hdr}>
          <h1 style={S.h1}>Bulk Screening</h1>
          <p style={S.sub}>Upload a CSV with one company or person name per row. Max 100 entities per batch.</p>
        </div>

        {/* Upload zone */}
        {phase === 'idle' && (
          <div style={S.dropzone} onClick={() => fileRef.current?.click()}>
            <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display:'none' }} onChange={onFile} />
            <div style={{ fontSize:32, marginBottom:8 }}>📂</div>
            <div style={{ fontSize:14, color:'#e6edf3', marginBottom:4 }}>Click to upload CSV</div>
            <div style={{ fontSize:12, color:'#8b949e' }}>One name per row · Max 100 rows</div>
          </div>
        )}

        {/* Preview */}
        {phase === 'preview' && (
          <div>
            <div style={S.previewHeader}>
              <div>
                <div style={{ fontSize:15, fontWeight:600, color:'#e6edf3' }}>{fileName}</div>
                <div style={{ fontSize:13, color:'#8b949e' }}>{preview.length} entities found</div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button style={S.secondaryBtn} onClick={reset}>Change file</button>
                <button style={S.primaryBtn} onClick={run}>Run screening</button>
              </div>
            </div>
            <div style={S.previewList}>
              {preview.slice(0, 10).map((n, i) => (
                <div key={i} style={S.previewItem}>{n}</div>
              ))}
              {preview.length > 10 && <div style={{ ...S.previewItem, color:'#4a5568' }}>+{preview.length - 10} more…</div>}
            </div>
          </div>
        )}

        {/* Running */}
        {(phase === 'running' || phase === 'done') && (
          <div>
            {phase === 'running' && (
              <div style={S.progressBox}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                  <span style={{ fontSize:13, color:'#e6edf3' }}>Screening {preview.length} entities…</span>
                  <span style={{ fontSize:13, color:'#58a6ff', fontFamily:'monospace' }}>{progress}%</span>
                </div>
                <div style={S.track}><div style={{ ...S.fill, width:`${progress}%` }} /></div>
              </div>
            )}

            {phase === 'done' && (
              <div style={S.doneBar}>
                <span style={{ fontSize:14, color:'#e6edf3' }}>
                  Screening complete · <span style={{ color: highRisk > 0 ? '#f85149' : '#3fb950' }}>
                    {highRisk} high-risk
                  </span> of {results.length}
                </span>
                <div style={{ display:'flex', gap:8 }}>
                  <button style={S.secondaryBtn} onClick={exportCSV}>⬇ Export CSV</button>
                  <button style={S.secondaryBtn} onClick={reset}>New batch</button>
                </div>
              </div>
            )}

            <table style={S.table}>
              <thead>
                <tr>
                  {['Entity','Risk','Sanctioned','Entities','Status'].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} style={{ background: r.sanctioned ? 'rgba(248,81,73,.05)' : 'transparent' }}>
                    <td style={S.td}>{r.name}</td>
                    <td style={{ ...S.td, color: r.risk >= 70 ? '#f85149' : r.risk >= 30 ? '#d29922' : r.risk != null ? '#3fb950' : '#4a5568', fontFamily:'monospace' }}>
                      {r.risk != null ? r.risk : '—'}
                    </td>
                    <td style={{ ...S.td, color: r.sanctioned ? '#f85149' : '#3fb950' }}>
                      {r.status === 'complete' ? (r.sanctioned ? '⚠ YES' : '✓ No') : '—'}
                    </td>
                    <td style={{ ...S.td, color:'#8b949e', fontFamily:'monospace' }}>{r.nodeCount ?? '—'}</td>
                    <td style={S.td}>
                      <span style={{ fontSize:11, padding:'2px 7px', borderRadius:99,
                        background: r.status==='complete'?'#1a3320':r.status==='failed'?'#2d1a1a':r.status==='building'?'#1e2a3a':'#21262d',
                        color: r.status==='complete'?'#3fb950':r.status==='failed'?'#f85149':r.status==='building'?'#58a6ff':'#8b949e',
                      }}>{r.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

const S = {
  page:        { minHeight:'100vh', background:'#0f1117' },
  container:   { maxWidth:760, margin:'0 auto', padding:'2rem 1rem' },
  hdr:         { marginBottom:'1.5rem' },
  h1:          { fontSize:22, fontWeight:600, color:'#e6edf3', marginBottom:6 },
  sub:         { fontSize:13, color:'#8b949e', lineHeight:1.6 },
  dropzone:    { border:'2px dashed #30363d', borderRadius:12, padding:'3rem', textAlign:'center', cursor:'pointer', transition:'border-color .2s' },
  previewHeader:{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'#161b22', border:'1px solid #30363d', borderRadius:10, padding:'1rem', marginBottom:8 },
  previewList: { background:'#161b22', border:'1px solid #30363d', borderRadius:10, overflow:'hidden' },
  previewItem: { padding:'8px 16px', borderBottom:'1px solid #21262d', fontSize:13, color:'#c9d1d9' },
  progressBox: { background:'#161b22', border:'1px solid #30363d', borderRadius:10, padding:'1rem', marginBottom:12 },
  track:       { height:4, background:'#21262d', borderRadius:2, overflow:'hidden' },
  fill:        { height:'100%', background:'#1f6feb', borderRadius:2, transition:'width .5s ease' },
  doneBar:     { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, flexWrap:'wrap', gap:8 },
  table:       { width:'100%', borderCollapse:'collapse', background:'#161b22', border:'1px solid #30363d', borderRadius:10, overflow:'hidden' },
  th:          { padding:'10px 14px', fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'.05em', color:'#8b949e', borderBottom:'1px solid #30363d', textAlign:'left', background:'#0d1117' },
  td:          { padding:'10px 14px', fontSize:13, color:'#c9d1d9', borderBottom:'1px solid #21262d' },
  primaryBtn:  { padding:'8px 18px', background:'#1f6feb', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:'pointer' },
  secondaryBtn:{ padding:'8px 14px', background:'transparent', color:'#8b949e', border:'1px solid #30363d', borderRadius:8, fontSize:13, cursor:'pointer' },
}
