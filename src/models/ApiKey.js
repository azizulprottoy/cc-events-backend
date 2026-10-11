const mongoose = require('mongoose');

const apiKeySchema = new mongoose.Schema(
  {
    startupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Startup', required: true, index: true },
    key: { type: String, required: true, unique: true },
    secret: { type: String, required: true },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ApiKey', apiKeySchema);
