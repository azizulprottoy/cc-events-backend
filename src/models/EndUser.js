const mongoose = require('mongoose');

const endUserSchema = new mongoose.Schema(
  {
    startupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Startup', required: true, index: true },
    externalId: { type: String, required: true },
    email: { type: String, default: null },
    phone: { type: String, default: null },
    traits: { type: mongoose.Schema.Types.Mixed, default: {} },
    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

endUserSchema.index({ startupId: 1, externalId: 1 }, { unique: true });

module.exports = mongoose.model('EndUser', endUserSchema);
