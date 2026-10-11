const mongoose = require('mongoose');

const notificationRuleSchema = new mongoose.Schema(
  {
    startupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Startup', required: true, index: true },
    name: { type: String, required: true },
    trigger: {
      type: { type: String, enum: ['event', 'inactivity', 'schedule'], required: true },
      event: { type: String, default: null }, // required when type === 'event'
      inactivityDays: { type: Number, default: null }, // required when type === 'inactivity'
      cron: { type: String, default: null }, // required when type === 'schedule'
    },
    channel: { type: String, enum: ['email', 'push', 'sms'], required: true },
    template: {
      subject: { type: String, default: null },
      body: { type: String, required: true },
    },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('NotificationRule', notificationRuleSchema);
