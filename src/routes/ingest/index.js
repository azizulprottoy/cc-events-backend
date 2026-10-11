const express = require('express');
const apiKeyAuth = require('../../middleware/apiKeyAuth');
const { ingestRateLimiter } = require('../../middleware/rateLimiter');
const eventService = require('../../services/eventService');
const { RecommendationList, EndUser } = require('../../models');
const asyncHandler = require('../../utils/asyncHandler');

const router = express.Router();

router.use(apiKeyAuth, ingestRateLimiter);

router.post(
  '/events',
  asyncHandler(async (req, res) => {
    const event = await eventService.trackEvent(req.startupId, req.body);
    res.status(201).json(event);
  })
);

router.post(
  '/events/batch',
  asyncHandler(async (req, res) => {
    const events = Array.isArray(req.body) ? req.body : req.body.events;
    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'Body must be an array of events (or { events: [...] })' });
    }

    const results = await Promise.allSettled(
      events.map((payload) => eventService.trackEvent(req.startupId, payload))
    );

    const created = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    const failed = results
      .filter((r) => r.status === 'rejected')
      .map((r) => r.reason.message || 'Unknown error');

    res.status(201).json({ created: created.length, failed });
  })
);

router.post(
  '/identify',
  asyncHandler(async (req, res) => {
    const endUser = await eventService.identify(req.startupId, req.body);
    res.json(endUser);
  })
);

router.get(
  '/recommendations/:externalId',
  asyncHandler(async (req, res) => {
    const endUser = await EndUser.findOne({ startupId: req.startupId, externalId: req.params.externalId });
    if (!endUser) return res.json({ items: [] });

    const list = await RecommendationList.findOne({ startupId: req.startupId, endUserId: endUser._id });
    res.json({ items: list ? list.items : [], generatedAt: list ? list.generatedAt : null });
  })
);

module.exports = router;
