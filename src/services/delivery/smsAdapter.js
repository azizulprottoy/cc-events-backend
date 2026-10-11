const { twilio: twilioConfig } = require('../../config/env');

let client = null;

function getClient() {
  if (!client) {
    const twilio = require('twilio');
    client = twilio(twilioConfig.accountSid, twilioConfig.authToken);
  }
  return client;
}

// endUser: EndUser doc, content: { body }
async function send(endUser, content) {
  if (!endUser.phone) throw new Error('EndUser has no phone on file');

  if (!twilioConfig.accountSid) {
    console.log(`[sms:dev] to=${endUser.phone} body="${content.body}"`);
    return;
  }

  await getClient().messages.create({
    from: twilioConfig.fromNumber,
    to: endUser.phone,
    body: content.body,
  });
}

module.exports = { send };
