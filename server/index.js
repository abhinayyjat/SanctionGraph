/**
 * server/index.js — Week 5 (final)
 * All routes + both Bull workers started after DB connects.
 */
require('dotenv').config()
const express  = require('express')
const mongoose = require('mongoose')
const cors     = require('cors')

const authRoutes     = require('./routes/auth')
const sanctionRoutes = require('./routes/sanctions')
const reportRoutes   = require('./routes/reports')
const { router: searchRoutes } = require('./routes/search')

const app = express()
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:3000', credentials: true }))
app.use(express.json({ limit: '10mb' }))

app.use('/api/auth',      authRoutes)
app.use('/api/sanctions', sanctionRoutes)
app.use('/api/search',    searchRoutes)
app.use('/api/reports',   reportRoutes)

app.get('/health', (_req, res) => res.json({ status:'ok', ts: Date.now() }))

app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message)
  res.status(err.status || 500).json({ success:false, message: err.message || 'Server error' })
})

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✓ MongoDB connected')
    require('./jobs/graphWorker')     // graph search queue
    require('./jobs/watchlistWorker') // daily re-scan cron
    const PORT = process.env.PORT || 5000
    app.listen(PORT, () => console.log(`✓ Server on port ${PORT}`))
  })
  .catch(err => { console.error('✗ MongoDB failed:', err.message); process.exit(1) })
