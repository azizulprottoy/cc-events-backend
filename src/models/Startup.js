const mongoose = require('mongoose');

const startupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    contactEmail: { type: String, required: true, lowercase: true, trim: true },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    recommendationConfig: {
      lookbackDays: { type: Number, default: 30 },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Startup', startupSchema);
