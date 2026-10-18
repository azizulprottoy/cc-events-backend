# Integrating with MarcoPolo

After your startup is registered, you get an `X-API-Key` / `X-API-Secret` pair. Send both on every request to the public ingestion API. Interactive docs: `GET /api-docs`.

## 1. Track an event

```bash
curl -X POST https://your-backend-host/v1/events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: mp_xxxxxxxx" \
  -H "X-API-Secret: xxxxxxxxxxxxxxxx" \
  -d '{
    "externalId": "user_123",
    "event": "AddToCart",
    "properties": { "productId": "sku_42", "price": 19.99 },
    "context": { "url": "https://yourapp.com/product/42" }
  }'
```

Send whatever `event` names make sense for your product (e.g. `Signup`, `Login`, `Purchase`, `PageView`) — there's no fixed enum.

## 2. Batch events (mobile offline flush, etc.)

```bash
curl -X POST https://your-backend-host/v1/events/batch \
  -H "Content-Type: application/json" \
  -H "X-API-Key: mp_xxxxxxxx" \
  -H "X-API-Secret: xxxxxxxxxxxxxxxx" \
  -d '{ "events": [ { "externalId": "user_123", "event": "PageView" }, ... ] }'
```

## 3. Identify a user (traits used for notification delivery)

```bash
curl -X POST https://your-backend-host/v1/identify \
  -H "Content-Type: application/json" \
  -H "X-API-Key: mp_xxxxxxxx" \
  -H "X-API-Secret: xxxxxxxxxxxxxxxx" \
  -d '{
    "externalId": "user_123",
    "traits": { "email": "user@example.com", "phone": "+15551234567", "pushToken": "fcm-device-token" }
  }'
```

`email`/`phone`/`pushToken` are what the notification engine uses to actually reach this user by email/SMS/push — set them via `identify` as soon as you know them.

## 4. Fetch recommendations for a user

```bash
curl https://your-backend-host/v1/recommendations/user_123 \
  -H "X-API-Key: mp_xxxxxxxx" \
  -H "X-API-Secret: xxxxxxxxxxxxxxxx"
```

## Minimal JS snippet wrapper (web)

```js
const MARCOPOLO = { apiKey: 'mp_xxxxxxxx', apiSecret: 'xxxxxxxxxxxxxxxx', host: 'https://your-backend-host' };

function track(externalId, event, properties = {}) {
  return fetch(`${MARCOPOLO.host}/v1/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': MARCOPOLO.apiKey,
      'X-API-Secret': MARCOPOLO.apiSecret,
    },
    body: JSON.stringify({ externalId, event, properties, context: { url: location.href } }),
  });
}
```

Mobile apps or backends integrate the same way — it's plain REST, no SDK required.

## 5. Personalised notifications and webhook delivery

Notification rules (dashboard > Notification Rules) pick **when** (on an event,
broadcast with "Send now", a cron schedule, or inactivity), **who** (user type,
trait equals, active within N days, did / didn't do an event within N days)
and **what** (email subject + text + optional HTML, or push title + message +
link). Every text field is a template:

| Placeholder | Value |
|---|---|
| `{{user.username}}`, `{{user.<trait>}}` | traits from `/v1/identify` |
| `{{user.email}}`, `{{user.phone}}`, `{{user.externalId}}` | end-user profile |
| `{{event}}`, `{{properties.<key>}}`, `{{<key>}}` | the triggering event (event rules) |
| `{{inactivityDays}}` | inactivity rules |
| `{{user.username \| there}}` | fallback when the value is missing |

In HTML, values are escaped. `cooldownHours` stops a rule from reaching the
same user twice within that window.

### Webhook delivery

A superadmin can set a webhook URL for a startup (admin > startup >
Notification delivery). Then MarcoPolo doesn't send anything itself: it POSTs
each rendered message to that URL and the startup delivers it.

```
POST <webhookUrl>
X-CC-Events-Timestamp: 1760000000
X-CC-Events-Signature: sha256=<hex HMAC-SHA256(secret, "<timestamp>.<raw body>")>

{ "type": "notification.deliver", "id": "<notification id>",
  "rule": { "id": "...", "name": "..." }, "channel": "email" | "push" | "sms",
  "externalId": "user_123", "user": { "email": "...", "phone": "..." },
  "content": { "subject", "title", "body", "html", "url", "from" } }
```

Verify the signature over the exact raw bytes and reject timestamps more than
5 minutes old. Reply `200 { "delivered": true }`, or
`200 { "delivered": false, "reason": "..." }` when it knowingly can't deliver;
non-2xx counts as failed. "Send test ping" posts `{ "type": "ping" }`.
