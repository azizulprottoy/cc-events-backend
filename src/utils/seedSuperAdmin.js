require('dotenv').config();
const connectDB = require('../config/db');
const { superAdmin: config } = require('../config/env');
const { SuperAdmin } = require('../models');
const { hashPassword } = require('./password');

async function run() {
  if (!config.email || !config.password) {
    console.error('Set SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD in .env first.');
    process.exit(1);
  }

  await connectDB();

  const existing = await SuperAdmin.findOne({ email: config.email });
  if (existing) {
    console.log(`SuperAdmin ${config.email} already exists.`);
    process.exit(0);
  }

  const passwordHash = await hashPassword(config.password);
  await SuperAdmin.create({ email: config.email, passwordHash });
  console.log(`SuperAdmin ${config.email} created.`);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
