// ============================================================
// Authentication & Authorization Middleware
// ============================================================
const jwt = require('jsonwebtoken');
const config = require('../config');
const userService = require('../services/userService');
const AUTH_COOKIE_NAME = 'shoplab_auth';

function getTokenFromRequest(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }

  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) {
    return null;
  }

  const cookies = Object.fromEntries(
    cookieHeader
      .split(';')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const separatorIndex = entry.indexOf('=');
        if (separatorIndex === -1) {
          return [entry, ''];
        }

        const name = entry.slice(0, separatorIndex);
        const value = entry.slice(separatorIndex + 1);
        return [name, decodeURIComponent(value)];
      })
  );

  return cookies[AUTH_COOKIE_NAME] || null;
}

/**
 * Verify JWT token and attach user to request.
 */
function authenticate(req, res, next) {
  const token = getTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function maybeAuthenticate(req, res, next) {
  const token = getTokenFromRequest(req);
  if (!token) {
    return next();
  }
  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    req.user = decoded;
  } catch (err) {
    req.user = null;
  }

  next();
}

/**
 * Require a specific role.
 */
function requireRole(role) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const user = await userService.findById(req.user.id);
    if (!user || user.role !== role) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { authenticate, maybeAuthenticate, requireRole, AUTH_COOKIE_NAME };
