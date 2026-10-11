const emailAdapter = require('./emailAdapter');
const pushAdapter = require('./pushAdapter');
const smsAdapter = require('./smsAdapter');

const adapters = { email: emailAdapter, push: pushAdapter, sms: smsAdapter };

async function send(channel, endUser, content) {
  const adapter = adapters[channel];
  if (!adapter) throw new Error(`Unknown channel: ${channel}`);
  await adapter.send(endUser, content);
}

module.exports = { send };
