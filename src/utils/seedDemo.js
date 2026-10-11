require('dotenv').config();
const connectDB = require('../config/db');
const { Startup, ApiKey, StartupUser, EndUser, Event, NotificationRule } = require('../models');
const { generateApiKeyPair } = require('./apiKey');
const { hashPassword } = require('./password');

const DEMO_NAME = 'Demo Shop';
const OWNER_EMAIL = 'owner@demoshop.local';
const OWNER_PASSWORD = 'DemoPass123!';
const DAYS = 14;
// Events to add per run; override with `npm run seed:demo -- 2000`.
const EVENT_COUNT = Number(process.argv[2]) || 1000;

const USERS = [
  'user_alice', 'user_bob', 'user_carol', 'user_dave', 'user_erin', 'user_frank',
  'user_grace', 'user_heidi', 'user_ivan', 'user_judy', 'user_mallory', 'user_niaj',
  'user_olivia', 'user_peggy', 'user_rupert', 'user_sybil', 'user_trent', 'user_victor',
];

const SOURCES = ['web', 'mobile', 'server'];

// Event name -> generator for realistic properties.
const EVENT_TYPES = {
  signed_up: () => ({ plan: pick(['free', 'pro']), referrer: pick(['google', 'twitter', 'direct']) }),
  page_viewed: () => ({ path: pick(['/', '/pricing', '/products', '/checkout']), durationMs: rand(500, 30000) }),
  product_viewed: () => ({ productId: `prod_${rand(1, 40)}`, category: pick(['shoes', 'bags', 'hats']), price: price() }),
  added_to_cart: () => ({ productId: `prod_${rand(1, 40)}`, quantity: rand(1, 3), price: price() }),
  purchase_completed: () => ({
    orderId: `ord_${rand(1000, 9999)}`,
    amount: price() * rand(1, 4),
    currency: 'USD',
    items: rand(1, 4),
    coupon: pick([null, 'WELCOME10', 'FALL20']),
  }),
  subscription_cancelled: () => ({ plan: 'pro', reason: pick(['too_expensive', 'not_using', 'switched']) }),
  logged_in: () => ({ method: pick(['password', 'google', 'apple', 'magic_link']), twoFactor: Math.random() < 0.3 }),
  logged_out: () => ({ sessionDurationSec: rand(30, 7200) }),
  app_opened: () => ({ appVersion: pick(['3.2.0', '3.2.1', '3.3.0']), platform: pick(['ios', 'android']), coldStart: Math.random() < 0.5 }),
  search_performed: () => ({ query: pick(['running shoes', 'leather bag', 'sun hat', 'sale', 'gift']), resultsCount: rand(0, 120) }),
  wishlist_added: () => ({ productId: `prod_${rand(1, 40)}`, category: pick(['shoes', 'bags', 'hats']) }),
  checkout_started: () => ({ cartValue: price() * rand(1, 3), items: rand(1, 5), currency: 'USD' }),
  coupon_applied: () => ({ coupon: pick(['WELCOME10', 'FALL20', 'VIP30']), discount: pick([10, 20, 30]), valid: Math.random() < 0.85 }),
  payment_failed: () => ({
    orderId: `ord_${rand(1000, 9999)}`,
    amount: price(),
    reason: pick(['card_declined', 'insufficient_funds', 'expired_card', '3ds_failed']),
    provider: pick(['stripe', 'paypal']),
  }),
  refund_requested: () => ({ orderId: `ord_${rand(1000, 9999)}`, amount: price(), reason: pick(['damaged', 'wrong_size', 'late_delivery']) }),
  review_submitted: () => ({ productId: `prod_${rand(1, 40)}`, rating: rand(1, 5), hasPhoto: Math.random() < 0.2 }),
  profile_updated: () => ({ fields: pick([['name'], ['email'], ['address', 'phone'], ['avatar']]) }),
  push_opened: () => ({ campaign: pick(['cart_reminder', 'new_arrivals', 'flash_sale']), deliveredAgoSec: rand(5, 86400) }),
  video_played: () => ({ videoId: `vid_${rand(1, 15)}`, positionSec: 0, durationSec: rand(15, 300) }),
  share_clicked: () => ({ productId: `prod_${rand(1, 40)}`, network: pick(['whatsapp', 'facebook', 'copy_link', 'x']) }),
};

// Rough relative frequency of each event.
const WEIGHTS = {
  page_viewed: 40,
  product_viewed: 25,
  app_opened: 15,
  search_performed: 14,
  added_to_cart: 12,
  logged_in: 10,
  wishlist_added: 6,
  checkout_started: 8,
  purchase_completed: 6,
  logged_out: 5,
  coupon_applied: 4,
  video_played: 4,
  push_opened: 3,
  share_clicked: 3,
  signed_up: 3,
  review_submitted: 2,
  payment_failed: 2,
  profile_updated: 2,
  refund_requested: 1,
  subscription_cancelled: 1,
};

const RULES = [
  {
    name: 'Welcome email',
    trigger: { type: 'event', event: 'signed_up' },
    channel: 'email',
    template: { subject: 'Welcome to Demo Shop!', body: 'Hi {{externalId}}, thanks for signing up.' },
  },
  {
    name: 'Order receipt',
    trigger: { type: 'event', event: 'purchase_completed' },
    channel: 'email',
    template: { subject: 'Your order', body: 'Thanks for your purchase of {{properties.amount}} {{properties.currency}}.' },
  },
  {
    name: 'Cart reminder push',
    trigger: { type: 'event', event: 'added_to_cart' },
    channel: 'push',
    template: { body: 'You left something in your cart!' },
    active: false,
  },
  {
    name: 'Payment failed SMS',
    trigger: { type: 'event', event: 'payment_failed' },
    channel: 'sms',
    template: { body: 'Your payment for {{properties.orderId}} failed ({{properties.reason}}). Please retry.' },
  },
  {
    name: 'Checkout nudge push',
    trigger: { type: 'event', event: 'checkout_started' },
    channel: 'push',
    template: { body: 'Almost there! Complete your order.' },
  },
  {
    name: 'Refund acknowledgement',
    trigger: { type: 'event', event: 'refund_requested' },
    channel: 'email',
    template: { subject: 'Refund request received', body: 'We got your refund request for {{properties.orderId}}.' },
  },
  {
    name: 'Review thank-you',
    trigger: { type: 'event', event: 'review_submitted' },
    channel: 'email',
    template: { subject: 'Thanks for your review', body: 'Here is 5% off your next order.' },
    active: false,
  },
  {
    name: 'Cancellation survey',
    trigger: { type: 'event', event: 'subscription_cancelled' },
    channel: 'email',
    template: { subject: 'Sorry to see you go', body: 'Tell us why you cancelled ({{properties.reason}}).' },
  },
  {
    name: 'Win-back after 7 days',
    trigger: { type: 'inactivity', inactivityDays: 7 },
    channel: 'email',
    template: { subject: 'We miss you', body: 'Come back and get 10% off.' },
  },
  {
    name: 'Daily digest',
    trigger: { type: 'schedule', cron: '0 9 * * *' },
    channel: 'sms',
    template: { body: 'New arrivals are in today.' },
  },
];

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function price() {
  return Number((rand(999, 14999) / 100).toFixed(2));
}

function weightedEvent() {
  const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  let n = Math.random() * total;
  for (const [name, w] of Object.entries(WEIGHTS)) {
    n -= w;
    if (n <= 0) return name;
  }
  return 'page_viewed';
}

// Creates Demo Shop on first run; later runs reuse it and append events,
// adding any users or rules that are new since last time.
async function ensureStartup() {
  const existing = await Startup.findOne({ name: DEMO_NAME });
  if (existing) return { startup: existing, created: false };

  const startup = await Startup.create({ name: DEMO_NAME, contactEmail: OWNER_EMAIL });
  const { key, secret } = generateApiKeyPair();
  await ApiKey.create({ startupId: startup._id, key, secret });
  await StartupUser.create({
    startupId: startup._id,
    email: OWNER_EMAIL,
    passwordHash: await hashPassword(OWNER_PASSWORD),
    role: 'owner',
  });
  console.log(`Created "${DEMO_NAME}".`);
  console.log(`Startup login: ${OWNER_EMAIL} / ${OWNER_PASSWORD}`);
  console.log(`API key: ${key}`);
  console.log(`API secret: ${secret}`);
  return { startup, created: true };
}

async function run() {
  await connectDB();

  const { startup } = await ensureStartup();
  const now = Date.now();

  for (const [i, externalId] of USERS.entries()) {
    await EndUser.updateOne(
      { startupId: startup._id, externalId },
      {
        $setOnInsert: {
          email: `${externalId.replace('user_', '')}@example.com`,
          firstSeenAt: new Date(now - (DAYS - (i % DAYS)) * 86400000),
        },
        $set: { lastSeenAt: new Date(now - rand(0, 3) * 86400000) },
      },
      { upsert: true }
    );
  }
  const endUsers = await EndUser.find({ startupId: startup._id, externalId: { $in: USERS } });

  const events = [];
  for (let i = 0; i < EVENT_COUNT; i++) {
    const user = pick(endUsers);
    const name = weightedEvent();
    events.push({
      startupId: startup._id,
      endUserId: user._id,
      externalId: user.externalId,
      event: name,
      source: pick(SOURCES),
      properties: EVENT_TYPES[name](),
      sessionId: `sess_${rand(1000, 9999)}`,
      context: {
        ip: `203.0.113.${rand(1, 254)}`,
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)',
        url: `https://demoshop.example.com${pick(['/', '/products', '/checkout'])}`,
      },
      createdAt: new Date(now - Math.random() * DAYS * 86400000),
    });
  }
  await Event.insertMany(events);

  const existingRules = await NotificationRule.find({ startupId: startup._id }).distinct('name');
  const newRules = RULES.filter((rule) => !existingRules.includes(rule.name));
  if (newRules.length) {
    await NotificationRule.insertMany(newRules.map((rule) => ({ ...rule, startupId: startup._id })));
  }

  const total = await Event.countDocuments({ startupId: startup._id });
  console.log(
    `"${DEMO_NAME}": +${events.length} events (${total} total), ${endUsers.length} users, +${newRules.length} rules.`
  );
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
