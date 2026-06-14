import { Link, useNavigate, useLocation } from 'react-router-dom'

export default function Navbar() {
  const nav = useNavigate()
  const loc = useLocation()
  const logout = () => { localStorage.removeItem('sg_token'); nav('/login') }
  const active = (path) => loc.pathname.startsWith(path)

  return (
    <nav style={S.nav}>
      <Link to="/search" style={S.logo}>⚖ SanctionGraph</Link>
      <div style={S.links}>
        {[
          ['/check',   'Sanctions Check'],
          ['/search',  'Graph Search'],
          ['/reports', 'Reports'],
        ].map(([path, label]) => (
          <Link key={path} to={path}
            style={{ ...S.link, ...(active(path) ? S.linkActive : {}) }}>
            {label}
          </Link>
        ))}
        <button onClick={logout} style={S.logout}>Log out</button>
      </div>
    </nav>
  )
}

const S = {
  nav:        { background:'#161b22', borderBottom:'1px solid #30363d', padding:'0 1.5rem', display:'flex', alignItems:'center', justifyContent:'space-between', height:52, position:'sticky', top:0, zIndex:100 },
  logo:       { color:'#e6edf3', textDecoration:'none', fontWeight:600, fontSize:15 },
  links:      { display:'flex', alignItems:'center', gap:16 },
  link:       { color:'#8b949e', textDecoration:'none', fontSize:13, transition:'color .15s' },
  linkActive: { color:'#e6edf3' },
  logout:     { background:'transparent', border:'1px solid #30363d', color:'#8b949e', padding:'4px 10px', borderRadius:6, fontSize:12, cursor:'pointer' },
}