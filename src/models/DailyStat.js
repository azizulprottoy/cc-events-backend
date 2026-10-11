const mongoose = require('mongoose');

const dailyStatSchema = new mongoose.Schema(
  {
    startupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Startup', required: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    eventType: { type: String, required: true },
    count: { type: Number, default: 0 },
    uniqueUserCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

dailyStatSchema.index({ startupId: 1, date: 1, eventType: 1 }, { unique: true });

module.exports = mongoose.model('DailyStat', dailyStatSchema);
