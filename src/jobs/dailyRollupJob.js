const cron = require('node-cron');
const { rollupDay } = require('../services/aggregationService');

// Runs just after midnight UTC, rolling up the day that just ended.
function scheduleDailyRollup() {
  cron.schedule('5 0 * * *', async () => {
    try {
      const rows = await rollupDay();
      console.log(`Daily rollup complete: ${rows} rows`);
    } catch (err) {
      console.error('Daily rollup failed:', err);
    }
  });
}

module.exports = scheduleDailyRollup;
