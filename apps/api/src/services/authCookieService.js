const config = require('../config');
const { AUTH_COOKIE_NAME } = require('../middleware/auth');
const { REMEMBER_COOKIE_NAME, createRememberToken } = require('./rememberTokenService');

function setAuthCookie(res, token) {
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.server.env === 'production',
    path: '/',
    maxAge: 24 * 60 * 60 * 1000,
  });
}

function setRememberCookie(res, user) {
  res.cookie(REMEMBER_COOKIE_NAME, createRememberToken(user), {
    httpOnly: false,
    sameSite: 'lax',
    secure: config.server.env === 'production',
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

function clearAuthCookies(res) {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.server.env === 'production',
    path: '/',
  });
  res.clearCookie(REMEMBER_COOKIE_NAME, { sameSite: 'lax', path: '/' });
}

module.exports = { setAuthCookie, setRememberCookie, clearAuthCookies };
