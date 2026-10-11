const express = require('express');
const { requireStartupUser } = require('../../middleware/auth');
const { NotificationRule, Notification } = require('../../models');
const notificationEngine = require('../../services/notificationEngine');
const asyncHandler = require('../../utils/asyncHandler');

const router = express.Router();

router.use(requireStartupUser);

router.get(
  '/rules',
  asyncHandler(async (req, res) => {
    const rules = await NotificationRule.find({ startupId: req.startupId }).sort({ createdAt: -1 });
    res.json(rules);
  })
);

router.post(
  '/rules',
  asyncHandler(async (req, res) => {
    const { name, trigger, channel, template } = req.body;
    if (!name || !trigger || !trigger.type || !channel || !template || !template.body) {
      return res.status(400).json({ error: 'name, trigger (with type), channel and template.body are required' });
    }

    const rule = await NotificationRule.create({ startupId: req.startupId, name, trigger, channel, template });
    if (rule.trigger.type === 'schedule') notificationEngine.refreshScheduledRule(rule);

    res.status(201).json(rule);
  })
);

router.patch(
  '/rules/:id',
  asyncHandler(async (req, res) => {
    const rule = await NotificationRule.findOneAndUpdate(
      { _id: req.params.id, startupId: req.startupId },
      req.body,
      { new: true }
    );
    if (!rule) return res.status(404).json({ error: 'Rule not found' });

    notificationEngine.unregisterScheduledRule(rule._id);
    if (rule.trigger.type === 'schedule') notificationEngine.refreshScheduledRule(rule);

    res.json(rule);
  })
);

router.delete(
  '/rules/:id',
  asyncHandler(async (req, res) => {
    const rule = await NotificationRule.findOneAndDelete({ _id: req.params.id, startupId: req.startupId });
    if (!rule) return res.status(404).json({ error: 'Rule not found' });

    notificationEngine.unregisterScheduledRule(rule._id);
    res.status(204).send();
  })
);

router.get(
  '/history',
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [items, total] = await Promise.all([
      Notification.find({ startupId: req.startupId }).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Notification.countDocuments({ startupId: req.startupId }),
    ]);

    res.json({ items, total, page: Number(page), limit: Number(limit) });
  })
);

module.exports = router;
