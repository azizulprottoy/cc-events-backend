const { firebaseServiceAccountJson } = require('../../config/env');

let messaging = null;

function getMessaging() {
  if (messaging) return messaging;
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    const credentials = JSON.parse(firebaseServiceAccountJson);
    admin.initializeApp({ credential: admin.credential.cert(credentials) });
  }
  messaging = admin.messaging();
  return messaging;
}

// endUser: EndUser doc (push token expected at endUser.traits.pushToken,
// set via the /v1/identify traits payload). content: { subject, body }
async function send(endUser, content) {
  const token = endUser.traits && endUser.traits.pushToken;
  if (!token) throw new Error('EndUser has no pushToken in traits');

  if (!firebaseServiceAccountJson) {
    console.log(`[push:dev] token=${token} title="${content.subject}" body="${content.body}"`);
    return;
  }

  await getMessaging().send({
    token,
    notification: { title: content.subject || 'Notification', body: content.body },
  });
}

module.exports = { send };
