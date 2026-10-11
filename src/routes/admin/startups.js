const express = require('express');
const { nanoid } = require('nanoid');
const { Startup, ApiKey, StartupUser } = require('../../models');
const { generateApiKeyPair } = require('../../utils/apiKey');
const { hashPassword } = require('../../utils/password');
const { generateDashboardLinkToken } = require('../../utils/dashboardLink');
const { requireSuperAdmin } = require('../../middleware/auth');
const asyncHandler = require('../../utils/asyncHandler');

const router = express.Router();

router.use(requireSuperAdmin);

// Register a new startup: creates the tenant, its API key pair, and its
// first dashboard login (owner). ownerPassword is generated if not supplied,
// and returned once in the response — there's nowhere else to see it again.
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, contactEmail, ownerEmail, ownerPassword } = req.body;
    if (!name || !contactEmail || !ownerEmail) {
      return res.status(400).json({ error: 'name, contactEmail and ownerEmail are required' });
    }

    const startup = await Startup.create({ name, contactEmail });

    const { key, secret } = generateApiKeyPair();
    await ApiKey.create({ startupId: startup._id, key, secret });

    const generatedPassword = ownerPassword || nanoid(12);
    const passwordHash = await hashPassword(generatedPassword);
    await StartupUser.create({
      startupId: startup._id,
      email: ownerEmail.toLowerCase(),
      passwordHash,
      role: 'owner',
    });

    res.status(201).json({
      startup,
      apiKey: { key, secret },
      owner: { email: ownerEmail.toLowerCase(), password: generatedPassword },
    });
  })
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const startups = await Startup.find().sort({ createdAt: -1 });
    res.json(startups);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const startup = await Startup.findById(req.params.id);
    if (!startup) return res.status(404).json({ error: 'Startup not found' });

    const apiKey = await ApiKey.findOne({ startupId: startup._id, revokedAt: null });
    res.json({ startup, apiKey: apiKey ? { key: apiKey.key } : null });
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { status } = req.body;
    if (!['active', 'suspended'].includes(status)) {
      return res.status(400).json({ error: 'status must be "active" or "suspended"' });
    }

    const startup = await Startup.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!startup) return res.status(404).json({ error: 'Startup not found' });
    res.json(startup);
  })
);

router.post(
  '/:id/regenerate-key',
  asyncHandler(async (req, res) => {
    const startup = await Startup.findById(req.params.id);
    if (!startup) return res.status(404).json({ error: 'Startup not found' });

    await ApiKey.updateMany({ startupId: startup._id, revokedAt: null }, { revokedAt: new Date() });

    const { key, secret } = generateApiKeyPair();
    await ApiKey.create({ startupId: startup._id, key, secret });

    res.status(201).json({ apiKey: { key, secret } });
  })
);

// Create or rotate the startup's view-only dashboard link. Rotating
// invalidates the previous link.
router.post(
  '/:id/dashboard-link',
  asyncHandler(async (req, res) => {
    const startup = await Startup.findByIdAndUpdate(
      req.params.id,
      { dashboardLinkToken: generateDashboardLinkToken() },
      { new: true }
    );
    if (!startup) return res.status(404).json({ error: 'Startup not found' });
    res.status(201).json({ token: startup.dashboardLinkToken });
  })
);

router.delete(
  '/:id/dashboard-link',
  asyncHandler(async (req, res) => {
    const startup = await Startup.findByIdAndUpdate(req.params.id, { dashboardLinkToken: null }, { new: true });
    if (!startup) return res.status(404).json({ error: 'Startup not found' });
    res.status(204).end();
  })
);

module.exports = router;
