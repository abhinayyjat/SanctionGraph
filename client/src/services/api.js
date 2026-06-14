import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  timeout: 30_000,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('sg_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('sg_token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export const authAPI = {
  register: (d) => api.post('/auth/register', d),
  login:    (d) => api.post('/auth/login', d),
  me:       ()  => api.get('/auth/me'),
}

// NEW Week 2
export const sanctionAPI = {
  check:  (name) => api.post('/sanctions/check', { name }),
  cached: ()     => api.get('/sanctions/cached'),
  stats:  ()     => api.get('/sanctions/stats'),
}

export const searchAPI = {
  submit:  (entityName, maxHops = 3) => api.post('/search', { entityName, maxHops }),
  status:  (id) => api.get(`/search/${id}`),
  graph:   (id) => api.get(`/search/${id}/graph`),
  history: ()   => api.get('/search'),
}

export const reportAPI = {
  generate: (id)   => api.post(`/reports/${id}`),
  list:     ()     => api.get('/reports'),
  addWatch: (name) => api.post('/reports/watchlist', { name }),
}

export default api
