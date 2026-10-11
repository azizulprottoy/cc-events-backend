const express = require('express');
const { StartupUser } = require('../../models');
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

module.exports = router;
