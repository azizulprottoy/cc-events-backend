const mongoose = require('mongoose');

const startupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    contactEmail: { type: String, required: true, lowercase: true, trim: true },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    recommendationConfig: {
      lookbackDays: { type: Number, default: 30 },
    },
    // Secret for the no-login, read-only dashboard link (/l/:token).
    // null means no link is active.
    dashboardLinkToken: { type: String, default: null },
    // When webhookUrl is set, notifications are not sent by MarcoPolo's own
    // email/push/SMS adapters: the rendered message is POSTed to the startup,
    // signed with webhookSecret, and the startup delivers it.
    delivery: {
      webhookUrl: { type: String, default: null },
      webhookSecret: { type: String, default: null, select: false },
    },
  },
  { timestamps: true }
);

startupSchema.index(
  { dashboardLinkToken: 1 },
  { unique: true, partialFilterExpression: { dashboardLinkToken: { $type: 'string' } } }
);

module.exports = mongoose.model('Startup', startupSchema);
