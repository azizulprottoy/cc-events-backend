const { Event, EndUser, DailyStat } = require('../models');
const { toDateKey } = require('./aggregationService');

function dateKeysBack(days) {
  const keys = [];
  for (let i = days - 1; i >= 0; i--) {
    keys.push(toDateKey(new Date(Date.now() - i * 24 * 60 * 60 * 1000)));
  }
  return keys;
}

async function getOverview(startupId, days = 7) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [totalEvents, activeUsers, topEventTypes] = await Promise.all([
    Event.countDocuments({ startupId, createdAt: { $gte: since } }),
    Event.distinct('endUserId', { startupId, createdAt: { $gte: since } }).then((ids) => ids.length),
    Event.aggregate([
      { $match: { startupId, createdAt: { $gte: since } } },
      { $group: { _id: '$event', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      { $project: { _id: 0, event: '$_id', count: 1 } },
    ]),
  ]);

  return { periodDays: days, totalEvents, activeUsers, topEventTypes };
}

// Merges precomputed DailyStat rows (past days) with a live aggregation for
// today, so the chart is both fast and up-to-date.
async function getEventsOverTime(startupId, days = 30) {
  const keys = dateKeysBack(days);
  const todayKey = toDateKey(new Date());
  const pastKeys = keys.filter((k) => k !== todayKey);

  const totals = new Map(keys.map((k) => [k, 0]));

  const pastRows = await DailyStat.aggregate([
    { $match: { startupId, date: { $in: pastKeys } } },
    { $group: { _id: '$date', count: { $sum: '$count' } } },
  ]);
  pastRows.forEach((row) => totals.set(row._id, row.count));

  if (keys.includes(todayKey)) {
    const todayStart = new Date(`${todayKey}T00:00:00.000Z`);
    const todayCount = await Event.countDocuments({ startupId, createdAt: { $gte: todayStart } });
    totals.set(todayKey, todayCount);
  }

  return keys.map((date) => ({ date, count: totals.get(date) }));
}

async function getUserGrowth(startupId, days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const keys = dateKeysBack(days);
  const totals = new Map(keys.map((k) => [k, 0]));

  const rows = await EndUser.aggregate([
    { $match: { startupId, firstSeenAt: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$firstSeenAt' } },
        count: { $sum: 1 },
      },
    },
  ]);
  rows.forEach((row) => totals.set(row._id, row.count));

  return keys.map((date) => ({ date, newUsers: totals.get(date) }));
}

async function getEventsFeed(startupId, { event, externalId, page = 1, limit = 50 }) {
  const filter = { startupId };
  if (event) filter.event = event;
  if (externalId) filter.externalId = externalId;

  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    Event.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    Event.countDocuments(filter),
  ]);

  return { items, total, page: Number(page), limit: Number(limit) };
}

module.exports = { getOverview, getEventsOverTime, getUserGrowth, getEventsFeed };
