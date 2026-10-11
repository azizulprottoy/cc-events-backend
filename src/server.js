const app = require('./app');
const connectDB = require('./config/db');
const { port } = require('./config/env');
const scheduleDailyRollup = require('./jobs/dailyRollupJob');
const scheduleNotificationJobs = require('./jobs/notificationJobs');
const scheduleRecommendationJob = require('./jobs/recommendationJob');

async function start() {
  await connectDB();
  scheduleDailyRollup();
  scheduleNotificationJobs();
  scheduleRecommendationJob();
  app.listen(port, () => {
    console.log(`MarcoPolo backend listening on port ${port}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
