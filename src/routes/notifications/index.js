const express = require('express');
const mongoose = require('mongoose');
const cron = require('node-cron');
const { requireStartupUser } = require('../../middleware/auth');
const { NotificationRule, Notification, Event, EndUser } = require('../../models');
const notificationEngine = require('../../services/notificationEngine');
const audienceService = require('../../services/audienceService');
const delivery = require('../../services/delivery');
const asyncHandler = require('../../utils/asyncHandler');

const router = express.Router();

router.use(requireStartupUser);

const TRIGGERS = ['event', 'inactivity', 'schedule', 'broadcast'];
const CHANNELS = ['email', 'push', 'sms'];
const TEMPLATE_FIELDS = ['subject', 'title', 'body', 'html', 'url', 'from'];

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

const positiveOrNull = (value, field) => {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw badRequest(`${field} must be a positive number`);
  return n;
};

function cleanAudience(a = {}) {
  const eventCond = (c, field) => ({
    event: c?.event ? String(c.event).trim() : null,
    withinDays: positiveOrNull(c?.withinDays, `${field}.withinDays`),
  });
  return {
    userTypes: Array.isArray(a.userTypes) ? a.userTypes.map(String).map((s) => s.trim()).filter(Boolean) : [],
    traits: Array.isArray(a.traits)
      ? a.traits.filter((t) => t && t.key).map((t) => ({ key: String(t.key).trim(), value: t.value }))
      : [],
    activeWithinDays: positiveOrNull(a.activeWithinDays, 'audience.activeWithinDays'),
    didEvent: eventCond(a.didEvent, 'audience.didEvent'),
    didNotEvent: eventCond(a.didNotEvent, 'audience.didNotEvent'),
  };
}

// Whitelists and validates a rule body. With `existing`, missing fields keep
// their stored values (PATCH).
function cleanRule(body = {}, existing = null) {
  const merged = existing ? { ...existing.toObject(), ...body } : body;
  const out = {};

  if (!merged.name || !String(merged.name).trim()) throw badRequest('name is required');
  out.name = String(merged.name).trim();

  const trigger = { ...(existing?.trigger?.toObject?.() || {}), ...(body.trigger || {}) };
  if (!TRIGGERS.includes(trigger.type)) throw badRequest(`trigger.type must be one of ${TRIGGERS.join(', ')}`);
  out.trigger = { type: trigger.type, event: null, inactivityDays: null, cron: null };
  if (trigger.type === 'event') {
    if (!trigger.event) throw badRequest('trigger.event is required for event rules');
    out.trigger.event = String(trigger.event).trim();
  } else if (trigger.type === 'inactivity') {
    out.trigger.inactivityDays = positiveOrNull(trigger.inactivityDays, 'trigger.inactivityDays');
    if (!out.trigger.inactivityDays) throw badRequest('trigger.inactivityDays is required for inactivity rules');
  } else if (trigger.type === 'schedule') {
    if (!trigger.cron || !cron.validate(trigger.cron)) throw badRequest('trigger.cron must be a valid cron expression');
    out.trigger.cron = String(trigger.cron).trim();
  }

  if (!CHANNELS.includes(merged.channel)) throw badRequest(`channel must be one of ${CHANNELS.join(', ')}`);
  out.channel = merged.channel;

  const template = { ...(existing?.template?.toObject?.() || {}), ...(body.template || {}) };
  if (!template.body || !String(template.body).trim()) throw badRequest('template.body is required');
  out.template = {};
  for (const f of TEMPLATE_FIELDS) out.template[f] = template[f] ? String(template[f]) : null;

  if (body.audience !== undefined || !existing) out.audience = cleanAudience(body.audience);
  if (body.cooldownHours !== undefined || !existing) out.cooldownHours = positiveOrNull(body.cooldownHours, 'cooldownHours');
  if (body.active !== undefined) out.active = Boolean(body.active);

  return out;
}

async function findRule(req) {
  if (!mongoose.isValidObjectId(req.params.id)) return null;
  return NotificationRule.findOne({ _id: req.params.id, startupId: req.startupId });
}

// Tells the rule editor how messages leave: the startup's own webhook, or
// MarcoPolo's built-in email/push/SMS.
router.get(
  '/delivery',
  asyncHandler(async (req, res) => {
    const webhook = await delivery.getWebhook(req.startupId);
    res.json({ mode: webhook ? 'webhook' : 'builtin' });
  })
);

// What the rule editor can offer: recent event names, the userType values
// and trait keys seen on end-users, and property keys per event.
router.get(
  '/catalog',
  asyncHandler(async (req, res) => {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const [events, userTypes, traitRows, propRows] = await Promise.all([
      Event.aggregate([
        { $match: { startupId: req.startupId, createdAt: { $gte: since } } },
        { $group: { _id: '$event', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 200 },
      ]),
      EndUser.distinct('traits.userType', { startupId: req.startupId }),
      EndUser.aggregate([
        { $match: { startupId: req.startupId } },
        { $sort: { lastSeenAt: -1 } },
        { $limit: 500 },
        { $project: { keys: { $map: { input: { $objectToArray: { $ifNull: ['$traits', {}] } }, in: '$$this.k' } } } },
        { $unwind: '$keys' },
        { $group: { _id: '$keys' } },
      ]),
      Event.aggregate([
        { $match: { startupId: req.startupId, createdAt: { $gte: since } } },
        { $sort: { createdAt: -1 } },
        { $limit: 2000 },
        { $project: { event: 1, keys: { $map: { input: { $objectToArray: { $ifNull: ['$properties', {}] } }, in: '$$this.k' } } } },
        { $unwind: '$keys' },
        { $group: { _id: '$event', keys: { $addToSet: '$keys' } } },
      ]),
    ]);
    res.json({
      events: events.map((e) => ({ event: e._id, count: e.count })),
      userTypes: userTypes.filter(Boolean).sort(),
      traits: traitRows.map((t) => t._id).filter((k) => k !== 'pushToken').sort(),
      properties: Object.fromEntries(propRows.map((r) => [r._id, r.keys.sort()])),
    });
  })
);

router.get(
  '/rules',
  asyncHandler(async (req, res) => {
    const rules = await NotificationRule.find({ startupId: req.startupId }).sort({ createdAt: -1 });
    res.json(rules);
  })
);

router.post(
  '/rules',
  asyncHandler(async (req, res) => {
    const rule = await NotificationRule.create({ startupId: req.startupId, ...cleanRule(req.body) });
    if (rule.trigger.type === 'schedule') notificationEngine.refreshScheduledRule(rule);
    res.status(201).json(rule);
  })
);

router.patch(
  '/rules/:id',
  asyncHandler(async (req, res) => {
    const existing = await findRule(req);
    if (!existing) return res.status(404).json({ error: 'Rule not found' });

    existing.set(cleanRule(req.body, existing));
    const rule = await existing.save();

    notificationEngine.unregisterScheduledRule(rule._id);
    if (rule.trigger.type === 'schedule') notificationEngine.refreshScheduledRule(rule);

    res.json(rule);
  })
);

router.delete(
  '/rules/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Rule not found' });
    const rule = await NotificationRule.findOneAndDelete({ _id: req.params.id, startupId: req.startupId });
    if (!rule) return res.status(404).json({ error: 'Rule not found' });

    notificationEngine.unregisterScheduledRule(rule._id);
    res.status(204).send();
  })
);

// Send a broadcast (or schedule) rule to its audience right now.
router.post(
  '/rules/:id/send',
  asyncHandler(async (req, res) => {
    const rule = await findRule(req);
    if (!rule) return res.status(404).json({ error: 'Rule not found' });
    if (!rule.active) return res.status(400).json({ error: 'Rule is paused' });
    const result = await notificationEngine.sendNow(rule);
    res.status(202).json(result);
  })
);

// How many end-users an audience reaches, with a few examples.
router.post(
  '/audience/count',
  asyncHandler(async (req, res) => {
    const { audience, channel } = req.body || {};
    const webhook = await delivery.getWebhook(req.startupId);
    const result = await audienceService.count(req.startupId, cleanAudience(audience), { channel, webhook: Boolean(webhook) });
    res.json(result);
  })
);

// Renders a template for one real end-user without sending it.
router.post(
  '/preview',
  asyncHandler(async (req, res) => {
    const { template, trigger, externalId } = req.body || {};
    if (!template?.body) throw badRequest('template.body is required');
    const result = await notificationEngine.preview(req.startupId, { template, trigger, externalId: externalId || undefined });
    res.json(result);
  })
);

router.get(
  '/history',
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 50, ruleId, status } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const filter = { startupId: req.startupId };
    if (ruleId && mongoose.isValidObjectId(ruleId)) filter.ruleId = ruleId;
    if (['queued', 'sent', 'failed'].includes(status)) filter.status = status;

    const [items, total] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Notification.countDocuments(filter),
    ]);

    res.json({ items, total, page: Number(page), limit: Number(limit) });
  })
);

module.exports = router;
