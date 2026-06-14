/**
 * LEARNING — JWT Authentication Middleware
 *
 * JWT (JSON Web Token) flow:
 * 1. User logs in → server creates a signed token: jwt.sign({ userId }, SECRET)
 * 2. Client stores token (localStorage or memory)
 * 3. Client sends it in every request: Authorization: Bearer <token>
 * 4. This middleware verifies the token on every protected route
 *
 * The token is SIGNED with a secret. If anyone tampers with the payload,
 * the signature becomes invalid and jwt.verify() throws an error.
 * The server never needs to look up the database to check auth —
 * that's the whole advantage over session-based auth.
 *
 * Attach this middleware to any route you want to protect:
 *   router.get('/protected', auth, (req, res) => { ... })
 *   Inside the handler: req.user.id is the authenticated user's ID
 */

const jwt  = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async (req, res, next) => {
  try {
    // Extract token from "Authorization: Bearer <token>" header
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }
    const token = header.split(' ')[1];

    // Verify signature and decode payload
    // Throws if: token is expired, signature invalid, or malformed
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach user to request object so route handlers can access it
    // We do a DB lookup here to ensure the user still exists (not deleted after token issued)
    const user = await User.findById(decoded.id).select('-password');
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });

    req.user = user;
    next(); // pass control to the route handler

  } catch (err) {
    // jwt.verify() throws specific errors we can inspect:
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired — please log in again' });
    }
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};
