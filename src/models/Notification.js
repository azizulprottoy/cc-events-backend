const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    startupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Startup', required: true, index: true },
    endUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'EndUser', required: true },
    ruleId: { type: mongoose.Schema.Types.ObjectId, ref: 'NotificationRule', required: true },
    channel: { type: String, enum: ['email', 'push', 'sms'], required: true },
    status: { type: String, enum: ['queued', 'sent', 'failed'], default: 'queued' },
    content: { type: String, required: true },
    error: { type: String, default: null },
    sentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notification', notificationSchema);
