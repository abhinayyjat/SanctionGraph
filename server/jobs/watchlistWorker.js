/**
 * server/jobs/watchlistWorker.js — Week 5
 *
 * LEARNING — Bull cron jobs:
 * Bull supports cron-style repeating jobs via the 'repeat' option.
 * '0 2 * * *' = run at 02:00 every day (standard cron syntax).
 *
 * Cron syntax: minute hour day-of-month month day-of-week
 *   0 2 * * *  → 02:00 daily
 *   0 * * * *  → every hour
 *   * * * * *  → every minute (for testing)
 *
 * The job checks every entity on every user's watchlist,
 * re-runs the sanctions check, and emails the user if status changed.
 *
 * LEARNING — Why a separate queue for watchlist?
 * Watchlist re-scans are low-priority background work.
 * Keeping them separate from graph-search jobs means a flood of
 * scheduled re-scans never delays a user's interactive search.
 */

const Bull       = require('bull')
const User       = require('../models/User')
const mlService  = require('../services/mlService')
const nodemailer = require('nodemailer')

const watchlistQueue = new Bull('watchlist-rescan', process.env.REDIS_URL)

// ── Email transporter (configure with real SMTP in production) ────────────────
const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
  port:   Number(process.env.SMTP_PORT || 587),
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
})

// ── Schedule: run daily at 02:00 ─────────────────────────────────────────────
watchlistQueue.add(
  { type: 'daily-rescan' },
  {
    repeat: { cron: '0 2 * * *' },
    removeOnComplete: 10,
    removeOnFail: 5,
  }
)

// ── Worker ────────────────────────────────────────────────────────────────────
watchlistQueue.process(async (job) => {
  console.log('[Watchlist] Starting daily re-scan…')
  const users = await User.find({ 'watchlist.0': { $exists: true } }) // only users with watchlist items

  for (const user of users) {
    const alerts = []

    for (const item of user.watchlist) {
      try {
        const result = await mlService.checkSanctions(item.name)
        const newRisk = result.direct_hit ? 'CRITICAL' : result.score >= 50 ? 'HIGH' : 'CLEAR'

        // Detect status change: only alert if it got WORSE
        if (item.lastRisk && item.lastRisk !== newRisk &&
            (newRisk === 'CRITICAL' || (newRisk === 'HIGH' && item.lastRisk === 'CLEAR'))) {
          alerts.push({ name: item.name, oldRisk: item.lastRisk, newRisk })
        }

        // Update lastRisk in DB
        item.lastRisk    = newRisk
        item.lastChecked = new Date()
      } catch (err) {
        console.error(`[Watchlist] Failed for ${item.name}:`, err.message)
      }
    }

    await user.save()

    // Send email if any alerts
    if (alerts.length > 0 && user.email && process.env.SMTP_USER) {
      const alertList = alerts
        .map(a => `• ${a.name}: ${a.oldRisk} → ${a.newRisk}`)
        .join('\n')
      try {
        await transporter.sendMail({
          from:    `SanctionGraph <${process.env.SMTP_USER}>`,
          to:      user.email,
          subject: `⚠ Watchlist alert: ${alerts.length} status change${alerts.length > 1 ? 's' : ''}`,
          text:    `The following entities on your watchlist changed status:\n\n${alertList}\n\nLog in to SanctionGraph to view details.`,
        })
        console.log(`[Watchlist] Alert sent to ${user.email}`)
      } catch (err) {
        console.error('[Watchlist] Email failed:', err.message)
      }
    }
  }

  console.log(`[Watchlist] Daily re-scan complete. Processed ${users.length} users.`)
})

watchlistQueue.on('completed', j => console.log(`[Watchlist] Job ${j.id} done`))
watchlistQueue.on('failed',    (j, e) => console.error(`[Watchlist] Job ${j.id} failed:`, e.message))

console.log('✓ Watchlist worker scheduled (daily at 02:00)')

module.exports = { watchlistQueue }
