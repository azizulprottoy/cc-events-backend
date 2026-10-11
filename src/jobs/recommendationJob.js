const cron = require('node-cron');
const recommendationService = require('../services/recommendationService');

// Runs nightly, after the daily rollup, so recommendations reflect the
// freshest complete day of events.
function scheduleRecommendationJob() {
  cron.schedule('30 0 * * *', async () => {
    try {
      const updated = await recommendationService.generateAll();
      console.log(`Recommendation generation complete: ${updated} end-users updated`);
    } catch (err) {
      console.error('Recommendation generation failed:', err);
    }
  });
}

module.exports = scheduleRecommendationJob;
