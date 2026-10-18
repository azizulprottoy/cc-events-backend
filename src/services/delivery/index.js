const emailAdapter = require('./emailAdapter');
const pushAdapter = require('./pushAdapter');
const smsAdapter = require('./smsAdapter');
const webhookAdapter = require('./webhookAdapter');
const { Startup } = require('../../models');

const adapters = { email: emailAdapter, push: pushAdapter, sms: smsAdapter };

// Returns { webhookUrl, webhookSecret } when the startup delivers its own
// notifications, else null.
async function getWebhook(startupId) {
  const startup = await Startup.findById(startupId).select('+delivery.webhookSecret').lean();
  const d = startup?.delivery;
  return d?.webhookUrl && d?.webhookSecret ? d : null;
}

// job: { notificationId, rule, channel, endUser, content }
async function send(job, webhook) {
  if (webhook) return webhookAdapter.send(webhook, job);
  const adapter = adapters[job.channel];
  if (!adapter) throw new Error(`Unknown channel: ${job.channel}`);
  await adapter.send(job.endUser, job.content);
}

module.exports = { send, getWebhook };
