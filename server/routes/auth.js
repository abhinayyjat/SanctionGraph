/**
 * LEARNING — Auth routes: register + login
 *
 * Pattern: thin routes, logic in models/services.
 * The route handler just orchestrates:
 *   1. Validate input
 *   2. Call model methods
 *   3. Create JWT
 *   4. Return response
 */

const express = require('express');
const jwt     = require('jsonwebtoken');
const User    = require('../models/User');
const auth    = require('../middleware/auth');

const router = express.Router();

// ── Register ──────────────────────────────────────────────────────────────────
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'All fields required' });
    }

    // Check if email is already taken
    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ success: false, message: 'Email already registered' });

    // Create user — password is hashed automatically via pre-save hook in User model
    const user = await User.create({ name, email, password });

    // Sign a JWT — payload is just the user ID (small, all we need)
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(201).json({ success: true, token, user: { id: user._id, name: user.name, email: user.email } });

  } catch (err) { next(err); }
});

// ── Login ─────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required' });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    // LEARNING — Timing-safe comparison:
    // We always call comparePassword even if user not found (with a fake hash).
    // This prevents timing attacks where an attacker figures out valid emails
    // by measuring response time differences. Here it's simplified — in production
    // you'd use a constant-time dummy comparison for non-existent users.
    const valid = await user.comparePassword(password);
    if (!valid) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, user: { id: user._id, name: user.name, email: user.email } });

  } catch (err) { next(err); }
});

// ── Me (get current user) ─────────────────────────────────────────────────────
router.get('/me', auth, (req, res) => {
  res.json({ success: true, user: req.user });
});

module.exports = router;
