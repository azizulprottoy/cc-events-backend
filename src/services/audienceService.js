const { EndUser, Event } = require('../models');

const DAY_MS = 24 * 60 * 60 * 1000;
const TRAIT_KEY = /^[\w.-]{1,64}$/;

function daysAgo(days) {
  return new Date(Date.now() - Number(days) * DAY_MS);
}

async function externalIdsWithEvent(startupId, { event, withinDays }) {
  const filter = { startupId, event };
  if (withinDays) filter.createdAt = { $gte: daysAgo(withinDays) };
  return Event.distinct('externalId', filter);
}

/**
 * Builds the EndUser filter for a rule's audience. `channel` adds a
 * reachability condition when MarcoPolo delivers itself (with webhook
 * delivery the startup looks up contact details on its side).
 */
async function buildFilter(startupId, audience = {}, { channel, webhook = false } = {}) {
  const filter = { startupId };
  const and = [];

  if (audience.userTypes?.length) filter['traits.userType'] = { $in: audience.userTypes };

  for (const { key, value } of audience.traits || []) {
    if (!key || !TRAIT_KEY.test(key)) continue;
    filter[`traits.${key}`] = value;
  }

  if (audience.activeWithinDays) filter.lastSeenAt = { $gte: daysAgo(audience.activeWithinDays) };

  if (audience.didEvent?.event) {
    and.push({ externalId: { $in: await externalIdsWithEvent(startupId, audience.didEvent) } });
  }
  if (audience.didNotEvent?.event) {
    and.push({ externalId: { $nin: await externalIdsWithEvent(startupId, audience.didNotEvent) } });
  }

  if (!webhook) {
    if (channel === 'email') filter.email = { $nin: [null, ''] };
    if (channel === 'sms') filter.phone = { $nin: [null, ''] };
    if (channel === 'push') filter['traits.pushToken'] = { $nin: [null, ''] };
  }

  if (and.length) filter.$and = and;
  return filter;
}

async function count(startupId, audience, opts) {
  const filter = await buildFilter(startupId, audience, opts);
  const [total, sample] = await Promise.all([
    EndUser.countDocuments(filter),
    EndUser.find(filter).sort({ lastSeenAt: -1 }).limit(5).select('externalId email phone traits lastSeenAt').lean(),
  ]);
  return { count: total, sample };
}

async function matches(startupId, audience, endUserId, opts) {
  const filter = await buildFilter(startupId, audience, opts);
  return Boolean(await EndUser.exists({ ...filter, _id: endUserId }));
}

module.exports = { buildFilter, count, matches };
