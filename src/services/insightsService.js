const { Event, EndUser } = require('../models');

// Insights rank the values of one event property (e.g. serviceTitle,
// categoryName) by how much users engage with them, and find the users most
// interested in a given value: the audience for targeted marketing.

const PROPERTY_PATTERN = /^[A-Za-z0-9_]{1,64}(\.[A-Za-z0-9_]{1,64}){0,2}$/;

// Not every event means the same interest: completing a purchase says more
// than viewing a page. Weights are inferred from the event name so this works
// for any startup's naming.
const WEIGHT_RULES = [
  [/complet|purchas|paid|payment|order|checkout|subscri/i, 5],
  [/book|cart|favou?rite|wishlist|bid|select|accept|review|request/i, 3],
];

function eventWeight(name) {
  for (const [pattern, weight] of WEIGHT_RULES) if (pattern.test(name)) return weight;
  return 1;
}

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function baseMatch(startupId, { property, days, events }) {
  if (!PROPERTY_PATTERN.test(property || '')) throw badRequest('property must be a property key like "categoryName"');
  const path = `properties.${property}`;
  const since = new Date(Date.now() - Math.max(1, Math.min(365, Number(days) || 30)) * 86400000);
  const match = {
    startupId,
    createdAt: { $gte: since },
    // Only scalar values can be ranked (skip objects/arrays like location).
    [path]: { $type: ['string', 'number', 'bool'], $nin: [''] },
  };
  const eventList = String(events || '').split(',').map((e) => e.trim()).filter(Boolean);
  if (eventList.length) match.event = { $in: eventList };
  return { match, path };
}

// Property keys seen on recent events with how often each appears, so the UI
// can offer them. Only scalar values count.
async function listProperties(startupId) {
  const sample = await Event.find({ startupId }).sort({ createdAt: -1 }).limit(2000).select('properties').lean();
  const counts = new Map();
  for (const { properties } of sample) {
    for (const [key, value] of Object.entries(properties || {})) {
      if (value === null || typeof value === 'object' || value === '') continue;
      // Record ids and timestamps are unique per event; nothing to rank.
      if (key === 'id' || /At$/.test(key)) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

// Top values of `property`: events, unique users, per-event breakdown and an
// intent-weighted score.
async function getTopValues(startupId, { property, days, events, limit = 50 }) {
  const { match, path } = baseMatch(startupId, { property, days, events });

  const rows = await Event.aggregate([
    { $match: match },
    { $group: { _id: { value: `$${path}`, event: '$event' }, count: { $sum: 1 }, users: { $addToSet: '$externalId' } } },
    {
      $group: {
        _id: '$_id.value',
        total: { $sum: '$count' },
        byEvent: { $push: { event: '$_id.event', count: '$count' } },
        userSets: { $push: '$users' },
      },
    },
    {
      $project: {
        total: 1,
        byEvent: 1,
        users: { $size: { $reduce: { input: '$userSets', initialValue: [], in: { $setUnion: ['$$value', '$$this'] } } } },
      },
    },
  ]);

  return rows
    .map((row) => ({
      value: row._id,
      events: row.total,
      users: row.users,
      score: row.byEvent.reduce((sum, e) => sum + e.count * eventWeight(e.event), 0),
      byEvent: row.byEvent.sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(200, Number(limit) || 50));
}

// Users ranked by interest. With `value`, the audience for that one value
// (e.g. everyone into "AC Repair"); without it, each user's top values.
async function getAudience(startupId, { property, days, events, value, limit = 200 }) {
  const { match, path } = baseMatch(startupId, { property, days, events });
  if (value !== undefined && value !== '') {
    // Values arrive as strings from the query; match numbers/booleans too.
    const variants = [value];
    if (!Number.isNaN(Number(value))) variants.push(Number(value));
    if (value === 'true' || value === 'false') variants.push(value === 'true');
    match[path] = { $in: variants };
  }

  const rows = await Event.aggregate([
    { $match: match },
    {
      $group: {
        _id: { user: '$externalId', value: `$${path}`, event: '$event' },
        count: { $sum: 1 },
        lastAt: { $max: '$createdAt' },
      },
    },
  ]);

  const users = new Map();
  for (const row of rows) {
    const { user, value: v } = row._id;
    if (!users.has(user)) users.set(user, { externalId: user, score: 0, events: 0, lastInteractionAt: null, values: new Map() });
    const entry = users.get(user);
    const points = row.count * eventWeight(row._id.event);
    entry.score += points;
    entry.events += row.count;
    if (!entry.lastInteractionAt || row.lastAt > entry.lastInteractionAt) entry.lastInteractionAt = row.lastAt;
    entry.values.set(v, (entry.values.get(v) || 0) + points);
  }

  const ranked = [...users.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(1000, Number(limit) || 200));

  const profiles = await EndUser.find({ startupId, externalId: { $in: ranked.map((u) => u.externalId) } })
    .select('externalId email phone traits lastSeenAt')
    .lean();
  const byId = new Map(profiles.map((p) => [p.externalId, p]));

  return ranked.map((u) => {
    const profile = byId.get(u.externalId) || {};
    return {
      externalId: u.externalId,
      email: profile.email || null,
      phone: profile.phone || null,
      name: profile.traits?.username || profile.traits?.name || null,
      score: u.score,
      events: u.events,
      lastInteractionAt: u.lastInteractionAt,
      topValues: [...u.values.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([v, score]) => ({ value: v, score })),
    };
  });
}

// Event names that carry `property`, so the UI can narrow insights to one
// action (e.g. only service_viewed = clicks).
async function listEvents(startupId, { property, days }) {
  const { match } = baseMatch(startupId, { property, days });
  const rows = await Event.aggregate([
    { $match: match },
    { $group: { _id: '$event', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  return rows.map((r) => ({ event: r._id, count: r.count }));
}

// Daily event counts for the `top` most frequent values of `property`.
async function getTrend(startupId, { property, days, events, top = 5 }) {
  const { match, path } = baseMatch(startupId, { property, days, events });
  const leaders = await Event.aggregate([
    { $match: match },
    { $group: { _id: `$${path}`, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: Math.min(10, Number(top) || 5) },
  ]);
  const values = leaders.map((l) => l._id);
  if (!values.length) return { dates: [], series: [] };

  const rows = await Event.aggregate([
    { $match: { ...match, [path]: { $in: values } } },
    {
      $group: {
        _id: { value: `$${path}`, date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } },
        count: { $sum: 1 },
      },
    },
  ]);

  // Dense day axis so lines don't skip quiet days.
  const dayCount = Math.max(1, Math.min(365, Number(days) || 30));
  const dates = [];
  for (let i = dayCount - 1; i >= 0; i--) dates.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));

  const counts = new Map(rows.map((r) => [`${r._id.value}|${r._id.date}`, r.count]));
  return {
    dates,
    series: values.map((value) => ({ value, counts: dates.map((d) => counts.get(`${value}|${d}`) || 0) })),
  };
}

module.exports = { listProperties, listEvents, getTopValues, getTrend, getAudience, eventWeight };
