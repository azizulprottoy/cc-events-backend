const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema(
  {
    startupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Startup', required: true },
    endUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'EndUser', required: true },
    externalId: { type: String, required: true },
    event: { type: String, required: true },
    source: { type: String, enum: ['web', 'mobile', 'server'], default: 'server' },
    properties: { type: mongoose.Schema.Types.Mixed, default: {} },
    sessionId: { type: String, default: null },
    context: {
      ip: { type: String, default: null },
      userAgent: { type: String, default: null },
      url: { type: String, default: null },
      deviceInfo: { type: mongoose.Schema.Types.Mixed, default: null },
    },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);

eventSchema.index({ startupId: 1, event: 1, createdAt: -1 });
eventSchema.index({ startupId: 1, externalId: 1, createdAt: -1 });

module.exports = mongoose.model('Event', eventSchema);
