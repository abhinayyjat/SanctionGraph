/**
 * server/index.js — Week 3
 * Adds: searchRoutes + starts the Bull graph worker.
 *
 * LEARNING — Why require the worker here?
 * graphWorker.js calls graphQueue.process(), which registers the handler
 * and starts listening for jobs. If we never require() it, jobs pile up
 * in Redis but nobody processes them. Requiring it at startup ensures
 * the worker is always running alongside the web server.
 */
require('dotenv').config();
const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');

const authRoutes     = require('./routes/auth');
const sanctionRoutes = require('./routes/sanctions');
//const reportRoutes   = require('./routes/reports');
//const { router: searchRoutes } = require('./routes/search'); // NEW Week 3

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:3000', credentials: true }));
app.use(express.json({ limit: '10mb' }));

app.use('/api/auth',      authRoutes);
app.use('/api/sanctions', sanctionRoutes);
//app.use('/api/search',    searchRoutes);   // NEW Week 3
//app.use('/api/reports',   reportRoutes);

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));

app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({ success: false, message: err.message || 'Server error' });
});

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✓ MongoDB connected');
    // Start Bull worker AFTER DB is connected (worker reads/writes SearchResult)
    require('./jobs/graphWorker'); // NEW Week 3
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => console.log(`✓ Server on port ${PORT}`));
  })
  .catch(err => { console.error('✗ MongoDB failed:', err.message); process.exit(1); });