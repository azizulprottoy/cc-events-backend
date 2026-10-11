const mongoose = require('mongoose');
const { verifyToken } = require('../utils/jwt');

function decodeBearerToken(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  try {
    return verifyToken(token);
  } catch {
    return null;
  }
}

function requireSuperAdmin(req, res, next) {
  const decoded = decodeBearerToken(req);
  if (!decoded || decoded.role !== 'superadmin') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.superAdminId = decoded.sub;
  next();
}

function requireStartupUser(req, res, next) {
  const decoded = decodeBearerToken(req);
  if (!decoded || decoded.role !== 'startupuser') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.startupUserId = decoded.sub;
  req.startupId = new mongoose.Types.ObjectId(decoded.startupId);
  req.readOnly = Boolean(decoded.readOnly);
  // Sessions opened from a dashboard link can look but not change anything.
  if (req.readOnly && !['GET', 'HEAD'].includes(req.method)) {
    return res.status(403).json({ error: 'This dashboard link is view-only' });
  }
  next();
}

module.exports = { requireSuperAdmin, requireStartupUser };
