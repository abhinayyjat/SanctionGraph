/**
 * server/routes/reports.js — Week 5
 * Adds GET /watchlist and DELETE /watchlist/:name endpoints.
 */
const express      = require('express')
const auth         = require('../middleware/auth')
const SearchResult = require('../models/SearchResult')
const User         = require('../models/User')
const mlService    = require('../services/mlService')
const router       = express.Router()

router.post('/:searchId', auth, async (req, res, next) => {
  try {
    const s = await SearchResult.findOne({ _id: req.params.searchId, user: req.user._id })
    if (!s || s.status !== 'complete') return res.status(400).json({ success:false, message:'Search not ready' })
    const report = await mlService.generateReport(s.graphData, s.seedName)
    await SearchResult.findByIdAndUpdate(s._id, { report, reportGeneratedAt: new Date() })
    res.json({ success:true, report })
  } catch (err) { next(err) }
})

router.get('/', auth, async (req, res, next) => {
  try {
    const reports = await SearchResult
      .find({ user: req.user._id, report: { $exists: true } })
      .select('seedName overallRisk sanctionedCount report reportGeneratedAt createdAt')
      .sort({ reportGeneratedAt: -1 })
    res.json({ success:true, reports })
  } catch (err) { next(err) }
})

// Watchlist endpoints
router.get('/watchlist', auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('watchlist')
    res.json({ success:true, watchlist: user.watchlist || [] })
  } catch (err) { next(err) }
})

router.post('/watchlist', auth, async (req, res, next) => {
  try {
    const { name } = req.body
    if (!name?.trim()) return res.status(400).json({ success:false, message:'Name required' })
    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { watchlist: { name: name.trim(), addedAt: new Date() } }
    })
    res.json({ success:true })
  } catch (err) { next(err) }
})

router.delete('/watchlist/:name', auth, async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { watchlist: { name: req.params.name } }
    })
    res.json({ success:true })
  } catch (err) { next(err) }
})

module.exports = router
