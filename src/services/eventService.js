const { EndUser, Event } = require('../models');
const notificationEngine = require('./notificationEngine');

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

async function upsertEndUser(startupId, externalId, extra = {}) {
  return EndUser.findOneAndUpdate(
    { startupId, externalId },
    { $set: { lastSeenAt: new Date(), ...extra }, $setOnInsert: { firstSeenAt: new Date() } },
    { upsert: true, new: true }
  );
}

async function trackEvent(startupId, payload) {
  const { externalId, event, properties, timestamp, sessionId, context, source } = payload;
  if (!externalId) throw badRequest('externalId is required');
  if (!event) throw badRequest('event is required');

  const endUser = await upsertEndUser(startupId, externalId);

  const doc = await Event.create({
    startupId,
    endUserId: endUser._id,
    externalId,
    event,
    source: source || 'server',
    properties: properties || {},
    sessionId: sessionId || null,
    context: context || {},
    ...(timestamp ? { createdAt: new Date(timestamp) } : {}),
  });

  // Fire-and-forget: must never delay or fail the ingest response.
  notificationEngine.evaluateEventTrigger(startupId, endUser, doc).catch((err) =>
    console.error('evaluateEventTrigger failed:', err)
  );

  return doc;
}

async function identify(startupId, payload) {
  const { externalId, traits } = payload;
  if (!externalId) throw badRequest('externalId is required');

  const extra = {};
  if (traits && typeof traits === 'object') {
    if (traits.email) extra.email = traits.email;
    if (traits.phone) extra.phone = traits.phone;
    extra.traits = traits;
  }

  return upsertEndUser(startupId, externalId, extra);
}

module.exports = { trackEvent, identify, upsertEndUser };
