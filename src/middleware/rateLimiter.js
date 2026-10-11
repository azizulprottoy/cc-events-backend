const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const ingestRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  // Per API key. Server-side integrations funnel all their users through one
  // key, so they may need more than the default (INGEST_RATE_LIMIT).
  max: Number(process.env.INGEST_RATE_LIMIT) || 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.header('X-API-Key') || ipKeyGenerator(req.ip),
  message: { error: 'Rate limit exceeded, slow down.' },
});

module.exports = { ingestRateLimiter };
