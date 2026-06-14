const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  name:      { type: String, required: true, trim: true },
  email:     { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:  { type: String, required: true, minlength: 8 },
  plan:      { type: String, enum: ['free', 'pro'], default: 'free' },
  // Watchlist: entity names to re-scan every 24h
  watchlist: [{ name: String, addedAt: { type: Date, default: Date.now } }],
}, { timestamps: true }); // adds createdAt and updatedAt automatically

// LEARNING — Mongoose pre-save hook:
// Runs BEFORE the document is saved to MongoDB.
// We hash the password here so we never accidentally save plaintext.
UserSchema.pre('save', async function (next) {
  // 'this' refers to the document being saved
  // Only hash if password field was actually modified (avoid re-hashing on other updates)
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12); // 12 = cost factor
  next();
});

// LEARNING — Instance method:
// We attach a method directly to the document prototype.
// Used in the login route: user.comparePassword(inputPassword)
UserSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password); // returns Promise<boolean>
};

module.exports = mongoose.model('User', UserSchema);