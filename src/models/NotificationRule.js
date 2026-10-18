const mongoose = require('mongoose');

// Who a rule may reach. Every condition is optional; an empty audience
// means every end-user of the startup.
const audienceSchema = new mongoose.Schema(
  {
    userTypes: { type: [String], default: [] }, // matches traits.userType
    traits: { type: [{ key: String, value: mongoose.Schema.Types.Mixed, _id: false }], default: [] }, // traits.<key> === value
    activeWithinDays: { type: Number, default: null }, // lastSeenAt within N days
    didEvent: {
      event: { type: String, default: null },
      withinDays: { type: Number, default: null },
    },
    didNotEvent: {
      event: { type: String, default: null },
      withinDays: { type: Number, default: null },
    },
  },
  { _id: false }
);

const notificationRuleSchema = new mongoose.Schema(
  {
    startupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Startup', required: true, index: true },
    name: { type: String, required: true },
    trigger: {
      // broadcast: sent only when someone presses "Send now".
      type: { type: String, enum: ['event', 'inactivity', 'schedule', 'broadcast'], required: true },
      event: { type: String, default: null }, // required when type === 'event'
      inactivityDays: { type: Number, default: null }, // required when type === 'inactivity'
      cron: { type: String, default: null }, // required when type === 'schedule'
    },
    audience: { type: audienceSchema, default: () => ({}) },
    channel: { type: String, enum: ['email', 'push', 'sms'], required: true },
    // All fields accept {{placeholders}}; see utils/renderTemplate.
    template: {
      subject: { type: String, default: null }, // email subject
      title: { type: String, default: null }, // push title
      body: { type: String, required: true }, // plain text: email text part, push message, SMS
      html: { type: String, default: null }, // email HTML part (optional)
      url: { type: String, default: null }, // push deep link / email call-to-action
      from: { type: String, default: null }, // sending mailbox hint for webhook delivery
    },
    // Per end-user: don't send this rule to the same person again within N hours.
    cooldownHours: { type: Number, default: null },
    active: { type: Boolean, default: true },
    lastRun: {
      at: { type: Date, default: null },
      matched: { type: Number, default: 0 },
      sent: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('NotificationRule', notificationRuleSchema);
