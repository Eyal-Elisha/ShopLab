const jwt = require('jsonwebtoken');
const config = require('../config');
const userService = require('../services/userService');
const { REMEMBER_COOKIE_NAME, parseRememberToken } = require('../services/rememberTokenService');
const AUTH_COOKIE_NAME = 'shoplab_auth';

function getCookies(req) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return {};

  return Object.fromEntries(
    cookieHeader
      .split(';')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const separatorIndex = entry.indexOf('=');
        if (separatorIndex === -1) return [entry, ''];
        const name = entry.slice(0, separatorIndex);
        const value = entry.slice(separatorIndex + 1);
        return [name, decodeURIComponent(value)];
      })
  );
}

function getJwtFromRequest(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }

  return getCookies(req)[AUTH_COOKIE_NAME] || null;
}

function getRememberedUserFromRequest(req) {
  return parseRememberToken(getCookies(req)[REMEMBER_COOKIE_NAME]);
}

function authenticate(req, res, next) {
  const token = getJwtFromRequest(req);
  if (!token) {
    const rememberedUser = getRememberedUserFromRequest(req);
    if (rememberedUser) {
      req.user = rememberedUser;
      return next();
    }

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
  const token = getJwtFromRequest(req);
  if (!token) {
    req.user = getRememberedUserFromRequest(req);
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

module.exports = { authenticate, maybeAuthenticate, requireRole, AUTH_COOKIE_NAME, getJwtFromRequest };
