const mongoose = require('mongoose');

const startupUserSchema = new mongoose.Schema(
  {
    startupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Startup', required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['owner', 'member'], default: 'member' },
  },
  { timestamps: true }
);

startupUserSchema.index({ startupId: 1, email: 1 }, { unique: true });

module.exports = mongoose.model('StartupUser', startupUserSchema);
