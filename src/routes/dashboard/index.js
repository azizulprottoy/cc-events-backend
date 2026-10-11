const express = require('express');
const { requireStartupUser } = require('../../middleware/auth');
const dashboardService = require('../../services/dashboardService');
const { Startup } = require('../../models');
const { generateDashboardLinkToken } = require('../../utils/dashboardLink');
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

// Owner self-service for the view-only dashboard link. Hidden from
// link sessions themselves so a shared link can't be used to read or
// rotate its own token.
function rejectReadOnly(req, res, next) {
  if (req.readOnly) return res.status(403).json({ error: 'This dashboard link is view-only' });
  next();
}

router.get(
  '/link',
  rejectReadOnly,
  asyncHandler(async (req, res) => {
    const startup = await Startup.findById(req.startupId).select('dashboardLinkToken');
    res.json({ token: startup?.dashboardLinkToken || null });
  })
);

router.post(
  '/link',
  asyncHandler(async (req, res) => {
    const startup = await Startup.findByIdAndUpdate(
      req.startupId,
      { dashboardLinkToken: generateDashboardLinkToken() },
      { new: true }
    );
    res.status(201).json({ token: startup.dashboardLinkToken });
  })
);

router.delete(
  '/link',
  asyncHandler(async (req, res) => {
    await Startup.findByIdAndUpdate(req.startupId, { dashboardLinkToken: null });
    res.status(204).end();
  })
);

module.exports = router;
