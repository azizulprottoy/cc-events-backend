const cron = require('node-cron');
const { NotificationRule, Notification, EndUser, Event } = require('../models');
const renderTemplate = require('../utils/renderTemplate');
const delivery = require('./delivery');
const audienceService = require('./audienceService');

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const CONCURRENCY = 5;
const HIDDEN_TRAITS = ['pushToken'];

// ruleId -> node-cron ScheduledTask, for dynamically (re)registering
// 'schedule' trigger rules without restarting the process.
const scheduledTasks = new Map();
// Rules with an audience run in progress, so "Send now" can't double-send.
const runningRules = new Set();

const hasAudience = (audience = {}) =>
  Boolean(
    audience.userTypes?.length ||
      audience.traits?.length ||
      audience.activeWithinDays ||
      audience.didEvent?.event ||
      audience.didNotEvent?.event
  );

// Placeholder data for one end-user: {{user.*}} is the profile and traits,
// event triggers add {{event}} (name), {{properties.*}} and each property
// at top level ({{serviceTitle}}), as before.
function buildData(endUser, extra = {}) {
  const traits = { ...(endUser.traits || {}) };
  HIDDEN_TRAITS.forEach((k) => delete traits[k]);
  return {
    externalId: endUser.externalId,
    ...extra,
    user: {
      ...traits,
      externalId: endUser.externalId,
      email: endUser.email,
      phone: endUser.phone,
      firstSeenAt: endUser.firstSeenAt,
      lastSeenAt: endUser.lastSeenAt,
    },
  };
}

function eventData(eventDoc) {
  const properties = eventDoc.properties || {};
  return { ...properties, event: eventDoc.event, properties };
}

function renderContent(template, data) {
  const text = (t) => (t ? renderTemplate(t, data) : undefined);
  const content = {
    subject: text(template.subject),
    title: text(template.title),
    body: renderTemplate(template.body, data),
    html: template.html ? renderTemplate(template.html, data, { html: true }) : undefined,
    url: text(template.url),
    from: template.from || undefined,
  };
  // The built-in push adapter reads the title from `subject`.
  if (!content.subject && content.title) content.subject = content.title;
  return content;
}

async function onCooldown(rule, endUser) {
  if (!rule.cooldownHours) return false;
  return Boolean(
    await Notification.exists({
      ruleId: rule._id,
      endUserId: endUser._id,
      createdAt: { $gte: new Date(Date.now() - rule.cooldownHours * HOUR_MS) },
    })
  );
}

async function dispatch(rule, endUser, data, webhook) {
  const content = renderContent(rule.template, data);

  const notification = await Notification.create({
    startupId: rule.startupId,
    endUserId: endUser._id,
    externalId: endUser.externalId,
    ruleId: rule._id,
    channel: rule.channel,
    status: 'queued',
    subject: content.subject || null,
    content: content.body,
  });

  try {
    await delivery.send({ notificationId: notification._id, rule, channel: rule.channel, endUser, content }, webhook);
    notification.status = 'sent';
    notification.sentAt = new Date();
  } catch (err) {
    notification.status = 'failed';
    notification.error = err.message;
  }
  await notification.save();
  return notification;
}

// Sends `rule` to every end-user matching `filter`, a few at a time, and
// records the counts on the rule.
async function runForFilter(rule, filter, extraFor = () => ({})) {
  const webhook = await delivery.getWebhook(rule.startupId);
  const stats = { matched: 0, sent: 0, failed: 0, skipped: 0 };
  const cursor = EndUser.find(filter).cursor();
  let batch = [];

  const flush = async () => {
    await Promise.all(
      batch.map(async (endUser) => {
        try {
          if (await onCooldown(rule, endUser)) {
            stats.skipped++;
            return;
          }
          const n = await dispatch(rule, endUser, buildData(endUser, extraFor(endUser)), webhook);
          stats[n.status === 'sent' ? 'sent' : 'failed']++;
        } catch (err) {
          stats.failed++;
          console.error(`Notification dispatch failed for rule ${rule._id}:`, err);
        }
      })
    );
    batch = [];
  };

  for await (const endUser of cursor) {
    stats.matched++;
    batch.push(endUser);
    if (batch.length >= CONCURRENCY) await flush();
  }
  await flush();

  await NotificationRule.updateOne({ _id: rule._id }, { lastRun: { at: new Date(), ...stats } });
  return stats;
}

// Called right after an event is ingested. Fire-and-forget from the caller
// — must never throw back into the ingest request path.
async function evaluateEventTrigger(startupId, endUser, eventDoc) {
  const rules = await NotificationRule.find({
    startupId,
    active: true,
    'trigger.type': 'event',
    'trigger.event': eventDoc.event,
  });
  if (!rules.length) return;

  const webhook = await delivery.getWebhook(startupId);
  await Promise.all(
    rules.map(async (rule) => {
      try {
        if (hasAudience(rule.audience) || !webhook) {
          const ok = await audienceService.matches(startupId, rule.audience, endUser._id, { channel: rule.channel, webhook: Boolean(webhook) });
          if (!ok) return;
        }
        if (await onCooldown(rule, endUser)) return;
        await dispatch(rule, endUser, buildData(endUser, eventData(eventDoc)), webhook);
      } catch (err) {
        console.error(`Notification dispatch failed for rule ${rule._id}:`, err);
      }
    })
  );
}

// Daily sweep: for each active inactivity rule, notify end-users in its
// audience who have been silent for >= inactivityDays and haven't already
// been notified by this same rule within that window.
async function runInactivityCheck() {
  const rules = await NotificationRule.find({ active: true, 'trigger.type': 'inactivity' });

  for (const rule of rules) {
    try {
      const days = rule.trigger.inactivityDays;
      const cutoff = new Date(Date.now() - days * DAY_MS);
      const webhook = await delivery.getWebhook(rule.startupId);
      const base = await audienceService.buildFilter(rule.startupId, rule.audience, { channel: rule.channel, webhook: Boolean(webhook) });
      const notifiedRecently = await Notification.distinct('endUserId', { ruleId: rule._id, createdAt: { $gte: cutoff } });
      const filter = { $and: [base, { lastSeenAt: { $lte: cutoff } }, { _id: { $nin: notifiedRecently } }] };
      await runForFilter(rule, filter, () => ({ inactivityDays: days }));
    } catch (err) {
      console.error(`Inactivity check failed for rule ${rule._id}:`, err);
    }
  }
}

async function runAudienceRule(rule) {
  const key = String(rule._id);
  if (runningRules.has(key)) throw Object.assign(new Error('This rule is already sending'), { status: 409 });
  runningRules.add(key);
  try {
    const webhook = await delivery.getWebhook(rule.startupId);
    const filter = await audienceService.buildFilter(rule.startupId, rule.audience, { channel: rule.channel, webhook: Boolean(webhook) });
    return await runForFilter(rule, filter);
  } finally {
    runningRules.delete(key);
  }
}

// Sends a 'schedule' trigger rule to its audience.
async function runScheduledRule(ruleId) {
  const rule = await NotificationRule.findById(ruleId);
  if (!rule || !rule.active) return;
  await runAudienceRule(rule).catch((err) => console.error(`Scheduled notification failed for rule ${rule._id}:`, err));
}

/**
 * "Send now" for broadcast and schedule rules. Counts the audience, starts
 * sending in the background and returns the count straight away; progress
 * lands in rule.lastRun and the notification history.
 */
async function sendNow(rule) {
  if (!['broadcast', 'schedule'].includes(rule.trigger.type)) {
    throw Object.assign(new Error('Only broadcast and schedule rules can be sent now'), { status: 400 });
  }
  if (runningRules.has(String(rule._id))) {
    throw Object.assign(new Error('This rule is already sending'), { status: 409 });
  }
  const webhook = await delivery.getWebhook(rule.startupId);
  const { count } = await audienceService.count(rule.startupId, rule.audience, { channel: rule.channel, webhook: Boolean(webhook) });
  runAudienceRule(rule).catch((err) => console.error(`Send now failed for rule ${rule._id}:`, err));
  return { matched: count };
}

/**
 * Renders a template for one real end-user without sending anything. Uses
 * the given externalId, else the most recently seen user. Event rules get
 * that user's latest matching event (or anyone's) as sample properties.
 */
async function preview(startupId, { template, trigger = {}, externalId }) {
  const endUser = externalId
    ? await EndUser.findOne({ startupId, externalId }).lean()
    : await EndUser.findOne({ startupId }).sort({ lastSeenAt: -1 }).lean();
  if (!endUser) throw Object.assign(new Error(externalId ? 'No end-user with that externalId' : 'No end-users yet'), { status: 404 });

  let extra = {};
  if (trigger.type === 'event' && trigger.event) {
    const sample =
      (await Event.findOne({ startupId, event: trigger.event, endUserId: endUser._id }).sort({ createdAt: -1 }).lean()) ||
      (await Event.findOne({ startupId, event: trigger.event }).sort({ createdAt: -1 }).lean());
    extra = sample ? eventData(sample) : { event: trigger.event, properties: {} };
  } else if (trigger.type === 'inactivity') {
    extra = { inactivityDays: trigger.inactivityDays };
  }

  const data = buildData(endUser, extra);
  return { externalId: endUser.externalId, content: renderContent(template, data), data };
}

function unregisterScheduledRule(ruleId) {
  const task = scheduledTasks.get(String(ruleId));
  if (task) {
    task.stop();
    scheduledTasks.delete(String(ruleId));
  }
}

// (Re)registers or removes the cron task for a single 'schedule' rule.
// Call after any create/update/delete on a schedule-trigger rule.
function refreshScheduledRule(rule) {
  unregisterScheduledRule(rule._id);
  if (rule.active && rule.trigger.type === 'schedule' && rule.trigger.cron && cron.validate(rule.trigger.cron)) {
    const task = cron.schedule(rule.trigger.cron, () => runScheduledRule(rule._id));
    scheduledTasks.set(String(rule._id), task);
  }
}

async function registerAllScheduledRules() {
  const rules = await NotificationRule.find({ active: true, 'trigger.type': 'schedule' });
  rules.forEach(refreshScheduledRule);
}

module.exports = {
  evaluateEventTrigger,
  runInactivityCheck,
  refreshScheduledRule,
  unregisterScheduledRule,
  registerAllScheduledRules,
  sendNow,
  preview,
  renderContent,
  buildData,
};
