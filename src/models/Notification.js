const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    startupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Startup', required: true, index: true },
    endUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'EndUser', required: true },
    ruleId: { type: mongoose.Schema.Types.ObjectId, ref: 'NotificationRule', required: true },
    channel: { type: String, enum: ['email', 'push', 'sms'], required: true },
    status: { type: String, enum: ['queued', 'sent', 'failed'], default: 'queued' },
    externalId: { type: String, default: null },
    subject: { type: String, default: null },
    content: { type: String, required: true },
    error: { type: String, default: null },
    sentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Cooldown and inactivity checks look up a user's last send for a rule.
notificationSchema.index({ ruleId: 1, endUserId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
