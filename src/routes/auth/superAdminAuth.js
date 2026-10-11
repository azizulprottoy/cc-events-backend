const express = require('express');
const { SuperAdmin } = require('../../models');
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

    const admin = await SuperAdmin.findOne({ email: email.toLowerCase() });
    if (!admin || !(await comparePassword(password, admin.passwordHash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signToken({ sub: admin._id, role: 'superadmin' });
    res.json({ token });
  })
);

module.exports = router;
