const cron = require('node-cron');
const notificationEngine = require('../services/notificationEngine');

// Registers the daily inactivity sweep, plus every currently-active
// 'schedule' trigger rule (each on its own stored cron expression).
function scheduleNotificationJobs() {
  cron.schedule('10 0 * * *', async () => {
    try {
      await notificationEngine.runInactivityCheck();
    } catch (err) {
      console.error('Inactivity check failed:', err);
    }
  });

  notificationEngine.registerAllScheduledRules().catch((err) =>
    console.error('Failed to register scheduled notification rules:', err)
  );
}

module.exports = scheduleNotificationJobs;
