const cron = require('node-cron');
const { NotificationRule, Notification, EndUser } = require('../models');
const renderTemplate = require('../utils/renderTemplate');
const delivery = require('./delivery');

// ruleId -> node-cron ScheduledTask, for dynamically (re)registering
// 'schedule' trigger rules without restarting the process.
const scheduledTasks = new Map();

async function dispatch(rule, endUser, data) {
  const content = {
    subject: rule.template.subject ? renderTemplate(rule.template.subject, data) : undefined,
    body: renderTemplate(rule.template.body, data),
  };

  const notification = await Notification.create({
    startupId: rule.startupId,
    endUserId: endUser._id,
    ruleId: rule._id,
    channel: rule.channel,
    status: 'queued',
    content: content.body,
  });

  try {
    await delivery.send(rule.channel, endUser, content);
    notification.status = 'sent';
    notification.sentAt = new Date();
  } catch (err) {
    notification.status = 'failed';
    notification.error = err.message;
  }
  await notification.save();
  return notification;
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

  await Promise.all(
    rules.map((rule) =>
      dispatch(rule, endUser, { event: eventDoc.event, externalId: eventDoc.externalId, ...eventDoc.properties }).catch(
        (err) => console.error(`Notification dispatch failed for rule ${rule._id}:`, err)
      )
    )
  );
}

// Daily sweep: for each active inactivity rule, notify end-users who have
// been silent for >= inactivityDays and haven't already been notified by
// this same rule within that window.
async function runInactivityCheck() {
  const rules = await NotificationRule.find({ active: true, 'trigger.type': 'inactivity' });

  for (const rule of rules) {
    const cutoff = new Date(Date.now() - rule.trigger.inactivityDays * 24 * 60 * 60 * 1000);
    const candidates = await EndUser.find({ startupId: rule.startupId, lastSeenAt: { $lte: cutoff } });

    for (const endUser of candidates) {
      const alreadyNotified = await Notification.findOne({
        ruleId: rule._id,
        endUserId: endUser._id,
        createdAt: { $gte: cutoff },
      });
      if (alreadyNotified) continue;

      await dispatch(rule, endUser, { inactivityDays: rule.trigger.inactivityDays }).catch((err) =>
        console.error(`Inactivity notification failed for rule ${rule._id}:`, err)
      );
    }
  }
}

// Broadcasts a 'schedule' trigger rule to every end-user of its startup.
async function runScheduledRule(ruleId) {
  const rule = await NotificationRule.findById(ruleId);
  if (!rule || !rule.active) return;

  const endUsers = await EndUser.find({ startupId: rule.startupId });
  await Promise.all(
    endUsers.map((endUser) =>
      dispatch(rule, endUser, {}).catch((err) => console.error(`Scheduled notification failed for rule ${rule._id}:`, err))
    )
  );
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
};
