const { ApiKey, Startup } = require('../models');
const asyncHandler = require('../utils/asyncHandler');

const apiKeyAuth = asyncHandler(async function apiKeyAuth(req, res, next) {
  const key = req.header('X-API-Key');
  const secret = req.header('X-API-Secret');

  if (!key || !secret) {
    return res.status(401).json({ error: 'Missing X-API-Key or X-API-Secret header' });
  }

  const apiKey = await ApiKey.findOne({ key, secret, revokedAt: null });
  if (!apiKey) {
    return res.status(401).json({ error: 'Invalid API key/secret' });
  }

  const startup = await Startup.findById(apiKey.startupId);
  if (!startup || startup.status !== 'active') {
    return res.status(403).json({ error: 'Startup is not active' });
  }

  req.startupId = startup._id;
  next();
});

module.exports = apiKeyAuth;
