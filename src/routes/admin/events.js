const express = require('express');
const mongoose = require('mongoose');
const { Event, NotificationRule } = require('../../models');
const { requireSuperAdmin } = require('../../middleware/auth');
const asyncHandler = require('../../utils/asyncHandler');

const router = express.Router();

router.use(requireSuperAdmin);

// Optional ?startupId= scopes any admin view to one tenant; omitted means all.
function startupFilter(req) {
  const { startupId } = req.query;
  if (!startupId) return {};
  if (!mongoose.isValidObjectId(startupId)) {
    throw Object.assign(new Error('Invalid startupId'), { status: 400 });
  }
  return { startupId: new mongoose.Types.ObjectId(startupId) };
}

// Raw event feed across all startups.
router.get(
  '/events',
  asyncHandler(async (req, res) => {
    const { event, externalId } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));

    const filter = startupFilter(req);
    if (event) filter.event = event;
    if (externalId) filter.externalId = externalId;

    const [items, total] = await Promise.all([
      Event.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('startupId', 'name'),
      Event.countDocuments(filter),
    ]);

    res.json({ items, total, page, limit });
  })
);

// One row per distinct (startup, event name): volume, last seen, the most
// recent payload as a sample, and the event-type rules it triggers.
router.get(
  '/events/catalog',
  asyncHandler(async (req, res) => {
    const match = startupFilter(req);

    const [rows, rules] = await Promise.all([
      Event.aggregate([
        { $match: match },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: { startupId: '$startupId', event: '$event' },
            count: { $sum: 1 },
            lastSeenAt: { $first: '$createdAt' },
            sample: { $first: '$$ROOT' },
          },
        },
        { $sort: { count: -1 } },
        { $lookup: { from: 'startups', localField: '_id.startupId', foreignField: '_id', as: 'startup' } },
        { $unwind: { path: '$startup', preserveNullAndEmptyArrays: true } },
      ]),
      NotificationRule.find({ ...match, 'trigger.type': 'event' }).select('startupId name trigger.event channel active'),
    ]);

    const rulesByKey = new Map();
    for (const rule of rules) {
      const key = `${rule.startupId}:${rule.trigger.event}`;
      if (!rulesByKey.has(key)) rulesByKey.set(key, []);
      rulesByKey.get(key).push({ _id: rule._id, name: rule.name, channel: rule.channel, active: rule.active });
    }

    res.json(
      rows.map((row) => ({
        startup: row.startup ? { _id: row.startup._id, name: row.startup.name } : { _id: row._id.startupId, name: null },
        event: row._id.event,
        count: row.count,
        lastSeenAt: row.lastSeenAt,
        // Shaped exactly like a POST /v1/events body so it can be copied as-is.
        samplePayload: {
          externalId: row.sample.externalId,
          event: row.sample.event,
          source: row.sample.source,
          properties: row.sample.properties || {},
          ...(row.sample.sessionId ? { sessionId: row.sample.sessionId } : {}),
          ...(row.sample.context ? { context: row.sample.context } : {}),
        },
        triggers: rulesByKey.get(`${row._id.startupId}:${row._id.event}`) || [],
      }))
    );
  })
);

// Every notification rule (trigger point) across startups.
router.get(
  '/triggers',
  asyncHandler(async (req, res) => {
    const rules = await NotificationRule.find(startupFilter(req))
      .sort({ createdAt: -1 })
      .populate('startupId', 'name');
    res.json(rules);
  })
);

module.exports = router;
