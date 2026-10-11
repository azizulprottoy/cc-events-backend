const { Event, DailyStat } = require('../models');

function toDateKey(date) {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

// Rolls up yesterday's (UTC) raw events into per-startup/per-eventType
// DailyStat rows. Idempotent — safe to re-run for the same day.
async function rollupDay(date = new Date(Date.now() - 24 * 60 * 60 * 1000)) {
  const dateKey = toDateKey(date);
  const start = new Date(`${dateKey}T00:00:00.000Z`);
  const end = new Date(`${dateKey}T23:59:59.999Z`);

  const rows = await Event.aggregate([
    { $match: { createdAt: { $gte: start, $lte: end } } },
    {
      $group: {
        _id: { startupId: '$startupId', eventType: '$event' },
        count: { $sum: 1 },
        uniqueUsers: { $addToSet: '$endUserId' },
      },
    },
  ]);

  await Promise.all(
    rows.map((row) =>
      DailyStat.findOneAndUpdate(
        { startupId: row._id.startupId, date: dateKey, eventType: row._id.eventType },
        { count: row.count, uniqueUserCount: row.uniqueUsers.length },
        { upsert: true }
      )
    )
  );

  return rows.length;
}

module.exports = { rollupDay, toDateKey };
