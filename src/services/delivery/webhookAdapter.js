const crypto = require('crypto');

const TIMEOUT_MS = 10000;

// Signature = HMAC-SHA256(secret, `${timestamp}.${rawBody}`), hex. The
// receiver recomputes it over the exact bytes it got and rejects stale
// timestamps, so a captured request can't be replayed later.
function sign(secret, timestamp, rawBody) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

async function post(delivery, payload) {
  const rawBody = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));

  let res;
  try {
    res = await fetch(delivery.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'MarcoPolo-Webhook/1',
        'X-CC-Events-Timestamp': timestamp,
        'X-CC-Events-Signature': `sha256=${sign(delivery.webhookSecret, timestamp, rawBody)}`,
      },
      body: rawBody,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new Error(`Webhook unreachable: ${err.message}`);
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    // non-JSON reply; status code decides
  }
  if (!res.ok) throw new Error(`Webhook HTTP ${res.status}${body?.message ? `: ${body.message}` : ''}`);
  // The receiver answers 200 { delivered: false, reason } when it knowingly
  // can't deliver (unknown user, no email on file), so that shows as failed.
  if (body && body.delivered === false) throw new Error(body.reason || 'Not delivered');
  return body;
}

// endUser: EndUser doc, content: { subject, title, body, html, url, from }
async function send(delivery, { notificationId, rule, channel, endUser, content }) {
  return post(delivery, {
    type: 'notification.deliver',
    id: String(notificationId),
    rule: { id: String(rule._id), name: rule.name },
    channel,
    externalId: endUser.externalId,
    user: { email: endUser.email || null, phone: endUser.phone || null },
    content,
  });
}

function ping(delivery) {
  return post(delivery, { type: 'ping', id: crypto.randomUUID() });
}

module.exports = { send, ping, sign };
