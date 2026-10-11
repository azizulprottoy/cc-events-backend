const express = require('express');
const { requireStartupUser } = require('../../middleware/auth');
const dashboardService = require('../../services/dashboardService');
const asyncHandler = require('../../utils/asyncHandler');

const router = express.Router();

router.use(requireStartupUser);

router.get(
  '/overview',
  asyncHandler(async (req, res) => {
    const days = Number(req.query.days) || 7;
    res.json(await dashboardService.getOverview(req.startupId, days));
  })
);

router.get(
  '/charts/events-over-time',
  asyncHandler(async (req, res) => {
    const days = Number(req.query.days) || 30;
    res.json(await dashboardService.getEventsOverTime(req.startupId, days));
  })
);

router.get(
  '/charts/user-growth',
  asyncHandler(async (req, res) => {
    const days = Number(req.query.days) || 30;
    res.json(await dashboardService.getUserGrowth(req.startupId, days));
  })
);

router.get(
  '/events',
  asyncHandler(async (req, res) => {
    const { event, externalId, page, limit } = req.query;
    res.json(await dashboardService.getEventsFeed(req.startupId, { event, externalId, page, limit }));
  })
);

module.exports = router;
