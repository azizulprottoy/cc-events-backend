const express = require('express');
const { Startup, StartupUser } = require('../../models');
const { comparePassword } = require('../../utils/password');
const { signToken } = require('../../utils/jwt');
const asyncHandler = require('../../utils/asyncHandler');

const router = express.Router();

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const user = await StartupUser.findOne({ email: email.toLowerCase() });
    if (!user || !(await comparePassword(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signToken({
      sub: user._id,
      role: 'startupuser',
      startupId: user.startupId,
    });
    res.json({ token });
  })
);

// Exchange a dashboard link token for a short-lived, read-only session.
// The token is the only credential, so it is checked against an active
// startup on every exchange — revoking or suspending takes effect at once
// for new opens; already-issued sessions expire within LINK_SESSION_TTL.
const LINK_SESSION_TTL = '12h';

router.post(
  '/link',
  asyncHandler(async (req, res) => {
    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'token is required' });
    }

    const startup = await Startup.findOne({ dashboardLinkToken: token });
    if (!startup) return res.status(401).json({ error: 'This dashboard link is invalid or has been revoked' });
    if (startup.status !== 'active') return res.status(403).json({ error: 'Startup is not active' });

    const sessionToken = signToken(
      { sub: startup._id, role: 'startupuser', startupId: startup._id, readOnly: true },
      { expiresIn: LINK_SESSION_TTL }
    );
    res.json({ token: sessionToken, startup: { name: startup.name } });
  })
);

module.exports = router;
