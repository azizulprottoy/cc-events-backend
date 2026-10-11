const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./docs/swaggerSpec');

const superAdminAuthRoutes = require('./routes/auth/superAdminAuth');
const startupAuthRoutes = require('./routes/auth/startupAuth');
const adminStartupsRoutes = require('./routes/admin/startups');
const ingestRoutes = require('./routes/ingest');
const dashboardRoutes = require('./routes/dashboard');
const notificationsRoutes = require('./routes/notifications');
const recommendationsRoutes = require('./routes/recommendations');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use('/admin/auth', superAdminAuthRoutes);
app.use('/admin/startups', adminStartupsRoutes);
app.use('/auth', startupAuthRoutes);
app.use('/v1', ingestRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/notifications', notificationsRoutes);
app.use('/recommendations', recommendationsRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
