const { Startup, EndUser, Event, RecommendationList } = require('../models');

const ALGORITHM = 'top-events-v1';
const MAX_ITEMS = 5;

// Popularity-based recommender: for each end-user, recommends the
// startup-wide most-frequent events they personally haven't triggered yet
// within the lookback window.
async function generateForStartup(startup) {
  const lookbackDays = startup.recommendationConfig?.lookbackDays || 30;
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  const popularity = await Event.aggregate([
    { $match: { startupId: startup._id, createdAt: { $gte: since } } },
    { $group: { _id: '$event', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  if (popularity.length === 0) return 0;

  const endUsers = await EndUser.find({ startupId: startup._id });

  let updated = 0;
  for (const endUser of endUsers) {
    const done = await Event.distinct('event', {
      startupId: startup._id,
      endUserId: endUser._id,
      createdAt: { $gte: since },
    });
    const doneSet = new Set(done);

    const items = popularity
      .filter((row) => !doneSet.has(row._id))
      .slice(0, MAX_ITEMS)
      .map((row) => ({ label: row._id, score: row.count }));
    if (items.length === 0) continue;

    await RecommendationList.findOneAndUpdate(
      { startupId: startup._id, endUserId: endUser._id },
      { items, algorithm: ALGORITHM, generatedAt: new Date() },
      { upsert: true }
    );
    updated += 1;
  }

  return updated;
}

async function generateAll() {
  const startups = await Startup.find({ status: 'active' });
  let total = 0;
  for (const startup of startups) {
    total += await generateForStartup(startup);
  }
  return total;
}

module.exports = { generateForStartup, generateAll };
