import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authAPI } from '../services/api'

export default function Register() {
  const nav = useNavigate()
  const [form, setForm]   = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handle = async (e) => {
    e.preventDefault()
    if (form.password.length < 8) return setError('Password must be at least 8 characters')
    setLoading(true); setError('')
    try {
      const { data } = await authAPI.register(form)
      localStorage.setItem('sg_token', data.token)
      nav('/search')
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed')
    } finally { setLoading(false) }
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <h2 style={S.title}>Create account</h2>
        {error && <div style={S.err}>{error}</div>}
        <form onSubmit={handle}>
          {['name','email','password'].map(f => (
            <input key={f} style={S.input}
              type={f === 'email' ? 'email' : f === 'password' ? 'password' : 'text'}
              placeholder={f.charAt(0).toUpperCase() + f.slice(1)}
              value={form[f]}
              onChange={e => setForm({...form, [f]: e.target.value})} required />
          ))}
          <button style={S.btn} disabled={loading} type="submit">
            {loading ? 'Creating…' : 'Create account'}
          </button>
        </form>
        <p style={{marginTop:12,fontSize:13,color:'#718096'}}>
          Have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  )
}

const S = {
  page:  { minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f7fafc' },
  card:  { background:'#fff', padding:'2rem', borderRadius:12, boxShadow:'0 2px 12px rgba(0,0,0,.08)', width:'100%', maxWidth:360 },
  title: { fontSize:22, fontWeight:600, margin:'0 0 16px', color:'#1a202c' },
  err:   { background:'#fed7d7', color:'#c53030', padding:'8px 12px', borderRadius:6, fontSize:13, marginBottom:12 },
  input: { display:'block', width:'100%', padding:'10px 12px', border:'1px solid #e2e8f0', borderRadius:6, fontSize:14, marginBottom:10, outline:'none', boxSizing:'border-box' },
  btn:   { width:'100%', padding:'10px', background:'#2b6cb0', color:'#fff', border:'none', borderRadius:6, fontSize:14, fontWeight:500, cursor:'pointer' },
}
