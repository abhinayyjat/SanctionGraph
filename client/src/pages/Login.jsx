import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authAPI } from '../services/api'

export default function Login() {
  const nav = useNavigate()
  const [form, setForm]   = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handle = async (e) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const { data } = await authAPI.login(form)
      localStorage.setItem('sg_token', data.token)
      nav('/search')
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed')
    } finally { setLoading(false) }
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <h2 style={S.title}>SanctionGraph</h2>
        <p style={S.sub}>Beneficial ownership intelligence</p>
        {error && <div style={S.err}>{error}</div>}
        <form onSubmit={handle}>
          <input style={S.input} type="email" placeholder="Email"
            value={form.email} onChange={e => setForm({...form, email: e.target.value})} required />
          <input style={S.input} type="password" placeholder="Password"
            value={form.password} onChange={e => setForm({...form, password: e.target.value})} required />
          <button style={S.btn} disabled={loading} type="submit">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p style={{marginTop:12,fontSize:13,color:'#718096'}}>
          No account? <Link to="/register">Register</Link>
        </p>
      </div>
    </div>
  )
}

const S = {
  page:  { minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f7fafc' },
  card:  { background:'#fff', padding:'2rem', borderRadius:12, boxShadow:'0 2px 12px rgba(0,0,0,.08)', width:'100%', maxWidth:360 },
  title: { fontSize:22, fontWeight:600, margin:'0 0 4px', color:'#1a202c' },
  sub:   { color:'#718096', fontSize:13, marginBottom:20 },
  err:   { background:'#fed7d7', color:'#c53030', padding:'8px 12px', borderRadius:6, fontSize:13, marginBottom:12 },
  input: { display:'block', width:'100%', padding:'10px 12px', border:'1px solid #e2e8f0', borderRadius:6, fontSize:14, marginBottom:10, outline:'none', boxSizing:'border-box' },
  btn:   { width:'100%', padding:'10px', background:'#2b6cb0', color:'#fff', border:'none', borderRadius:6, fontSize:14, fontWeight:500, cursor:'pointer' },
}
