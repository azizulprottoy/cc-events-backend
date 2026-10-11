const mongoose = require('mongoose');

const recommendationListSchema = new mongoose.Schema(
  {
    startupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Startup', required: true },
    endUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'EndUser', required: true },
    items: [
      {
        label: String,
        score: Number,
      },
    ],
    algorithm: { type: String, default: 'top-events-v1' },
    generatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

recommendationListSchema.index({ startupId: 1, endUserId: 1 }, { unique: true });

module.exports = mongoose.model('RecommendationList', recommendationListSchema);
