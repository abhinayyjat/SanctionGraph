/**
 * client/src/pages/Watchlist.jsx — Week 5
 *
 * LEARNING — optimistic UI updates:
 * When user clicks "Remove", we remove the item from local state
 * IMMEDIATELY (before the API call completes). If the API call fails,
 * we restore the item. This makes the UI feel instant.
 *
 * Compare to pessimistic update: wait for API → then update state.
 * Pessimistic = safer but laggy. Optimistic = snappy but needs rollback.
 */

import { useState, useEffect } from 'react'
import { reportAPI, sanctionAPI } from '../services/api'
import Navbar from '../components/Navbar'

export default function Watchlist() {
  const [items,    setItems]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [newName,  setNewName]  = useState('')
  const [adding,   setAdding]   = useState(false)
  const [checking, setChecking] = useState({}) // { [name]: true } while re-checking

  useEffect(() => {
    reportAPI.getWatchlist()
      .then(({ data }) => setItems(data.watchlist || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const add = async (e) => {
    e.preventDefault()
    if (!newName.trim()) return
    setAdding(true)
    try {
      await reportAPI.addWatch(newName.trim())
      setItems(prev => [...prev, { name: newName.trim(), addedAt: new Date(), lastRisk: null }])
      setNewName('')
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to add')
    } finally { setAdding(false) }
  }

  const remove = async (name) => {
    // Optimistic: remove from UI immediately
    const prev = [...items]
    setItems(items.filter(i => i.name !== name))
    try {
      await reportAPI.removeWatch(name)
    } catch {
      setItems(prev)  // rollback on failure
    }
  }

  const recheck = async (name) => {
    setChecking(c => ({ ...c, [name]: true }))
    try {
      const { data } = await sanctionAPI.check(name)
      setItems(prev => prev.map(i =>
        i.name === name
          ? { ...i, lastRisk: data.risk_level, lastChecked: new Date(), direct_hit: data.sanctions.direct_hit }
          : i
      ))
    } catch { alert('Check failed') }
    finally { setChecking(c => ({ ...c, [name]: false })) }
  }

  const RISK_COLOR = { CRITICAL: '#f85149', HIGH: '#d29922', CLEAR: '#3fb950' }

  return (
    <div style={S.page}>
      <Navbar />
      <div style={S.container}>
        <div style={S.hdr}>
          <h1 style={S.h1}>Watchlist</h1>
          <p style={S.sub}>Entities are automatically re-scanned every 24 hours. You'll receive an email if their status changes.</p>
        </div>

        {/* Add form */}
        <form onSubmit={add} style={S.addForm}>
          <input style={S.input} value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="Add entity name to monitor…" />
          <button style={S.addBtn} type="submit" disabled={adding}>
            {adding ? 'Adding…' : '+ Add'}
          </button>
        </form>

        {loading ? <div style={S.spin} /> : items.length === 0 ? (
          <div style={S.empty}>
            <div style={{ fontSize:32, marginBottom:8 }}>👁</div>
            <div style={{ color:'#8b949e' }}>No entities on watchlist yet.</div>
            <div style={{ color:'#4a5568', fontSize:12, marginTop:4 }}>Add a company or person above to start monitoring.</div>
          </div>
        ) : (
          <div style={S.list}>
            {items.map(item => (
              <div key={item.name} style={S.card}>
                <div style={S.cardLeft}>
                  <div style={S.cardName}>{item.name}</div>
                  <div style={S.cardMeta}>
                    Added {new Date(item.addedAt).toLocaleDateString()}
                    {item.lastChecked && ` · Last checked ${new Date(item.lastChecked).toLocaleDateString()}`}
                  </div>
                </div>
                <div style={S.cardRight}>
                  {item.lastRisk && (
                    <span style={{ ...S.riskTag, color: RISK_COLOR[item.lastRisk] || '#8b949e',
                      background: item.lastRisk === 'CRITICAL' ? '#2d1a1a' : item.lastRisk === 'HIGH' ? '#2d2200' : '#0d2a1a',
                      borderColor: RISK_COLOR[item.lastRisk] || '#30363d',
                    }}>
                      {item.lastRisk}
                    </span>
                  )}
                  <button style={S.recheckBtn} onClick={() => recheck(item.name)}
                    disabled={checking[item.name]}>
                    {checking[item.name] ? '…' : '↻ Check'}
                  </button>
                  <button style={S.removeBtn} onClick={() => remove(item.name)}>✕</button>
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
  page:       { minHeight:'100vh', background:'#0f1117' },
  container:  { maxWidth:680, margin:'0 auto', padding:'2rem 1rem' },
  hdr:        { marginBottom:'1.5rem' },
  h1:         { fontSize:22, fontWeight:600, color:'#e6edf3', marginBottom:6 },
  sub:        { fontSize:13, color:'#8b949e', lineHeight:1.6 },
  addForm:    { display:'flex', gap:8, marginBottom:'1.5rem' },
  input:      { flex:1, padding:'10px 14px', background:'#161b22', border:'1px solid #30363d', borderRadius:8, fontSize:14, color:'#e6edf3', outline:'none' },
  addBtn:     { padding:'10px 18px', background:'#238636', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:'pointer' },
  spin:       { width:32, height:32, border:'3px solid #30363d', borderTop:'3px solid #58a6ff', borderRadius:'50%', margin:'3rem auto', animation:'spin 1s linear infinite' },
  empty:      { textAlign:'center', padding:'3rem 0', color:'#8b949e' },
  list:       { display:'flex', flexDirection:'column', gap:8 },
  card:       { background:'#161b22', border:'1px solid #30363d', borderRadius:10, padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 },
  cardLeft:   { flex:1, minWidth:0 },
  cardName:   { fontSize:15, fontWeight:500, color:'#e6edf3', marginBottom:3 },
  cardMeta:   { fontSize:12, color:'#8b949e' },
  cardRight:  { display:'flex', alignItems:'center', gap:8, flexShrink:0 },
  riskTag:    { fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:4, border:'1px solid' },
  recheckBtn: { padding:'5px 10px', background:'transparent', border:'1px solid #30363d', color:'#8b949e', borderRadius:6, fontSize:12, cursor:'pointer' },
  removeBtn:  { padding:'5px 8px', background:'transparent', border:'none', color:'#4a5568', fontSize:14, cursor:'pointer' },
}
