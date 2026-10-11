const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const ingestRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.header('X-API-Key') || ipKeyGenerator(req.ip),
  message: { error: 'Rate limit exceeded, slow down.' },
});

module.exports = { ingestRateLimiter };
