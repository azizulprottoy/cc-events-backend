const express = require('express');
const mongoose = require('mongoose');
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

    const [apiKey, users] = await Promise.all([
      ApiKey.findOne({ startupId: startup._id, revokedAt: null }),
      StartupUser.find({ startupId: startup._id }).select('email role createdAt updatedAt').sort({ role: -1, createdAt: 1 }),
    ]);
    res.json({ startup, apiKey: apiKey ? { key: apiKey.key } : null, users });
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

// Passwords are stored only as bcrypt hashes, so they can't be shown. A
// superadmin can instead set a new one: generated unless supplied, returned
// once in the response. The old password stops working immediately.
router.post(
  '/:id/users/:userId/reset-password',
  asyncHandler(async (req, res) => {
    const { password } = req.body || {};
    if (password !== undefined && (typeof password !== 'string' || password.length < 8)) {
      return res.status(400).json({ error: 'password must be at least 8 characters' });
    }

    if (![req.params.id, req.params.userId].every(mongoose.isValidObjectId)) {
      return res.status(404).json({ error: 'User not found for this startup' });
    }
    const user = await StartupUser.findOne({ _id: req.params.userId, startupId: req.params.id });
    if (!user) return res.status(404).json({ error: 'User not found for this startup' });

    const newPassword = password || nanoid(12);
    user.passwordHash = await hashPassword(newPassword);
    await user.save();

    console.log(`Superadmin ${req.superAdminId} reset password for startup user ${user.email} (${req.params.id})`);
    res.json({ email: user.email, password: newPassword });
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
