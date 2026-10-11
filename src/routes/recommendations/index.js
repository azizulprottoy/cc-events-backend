const express = require('express');
const { requireStartupUser } = require('../../middleware/auth');
const { Startup, EndUser, RecommendationList } = require('../../models');
const recommendationService = require('../../services/recommendationService');
const asyncHandler = require('../../utils/asyncHandler');

const router = express.Router();

router.use(requireStartupUser);

router.get(
  '/config',
  asyncHandler(async (req, res) => {
    const startup = await Startup.findById(req.startupId);
    res.json(startup.recommendationConfig);
  })
);

router.patch(
  '/config',
  asyncHandler(async (req, res) => {
    const { lookbackDays } = req.body;
    if (!Number.isInteger(lookbackDays) || lookbackDays <= 0) {
      return res.status(400).json({ error: 'lookbackDays must be a positive integer' });
    }

    const startup = await Startup.findByIdAndUpdate(
      req.startupId,
      { 'recommendationConfig.lookbackDays': lookbackDays },
      { new: true }
    );
    res.json(startup.recommendationConfig);
  })
);

// Manually trigger generation for this startup (dev/testing convenience —
// production relies on the nightly cron).
router.post(
  '/generate',
  asyncHandler(async (req, res) => {
    const startup = await Startup.findById(req.startupId);
    const updated = await recommendationService.generateForStartup(startup);
    res.json({ updated });
  })
);

// Dashboard-facing equivalent of the public GET /v1/recommendations/:externalId
// — same lookup, but scoped by the JWT's startupId instead of an API key,
// so the dashboard can look up any of its own end-users without holding
// their integration credentials.
router.get(
  '/lookup/:externalId',
  asyncHandler(async (req, res) => {
    const endUser = await EndUser.findOne({ startupId: req.startupId, externalId: req.params.externalId });
    if (!endUser) return res.json({ items: [] });

    const list = await RecommendationList.findOne({ startupId: req.startupId, endUserId: endUser._id });
    res.json({ items: list ? list.items : [], generatedAt: list ? list.generatedAt : null });
  })
);

module.exports = router;
