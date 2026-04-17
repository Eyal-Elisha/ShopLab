const jwt = require('jsonwebtoken');
const config = require('../config');
const userService = require('../services/userService');
const { AUTH_COOKIE_NAME } = require('../middleware/auth');

function getAuthCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.server.env === 'production',
    path: '/',
    maxAge: 24 * 60 * 60 * 1000,
  };
}

function setAuthCookie(res, token) {
  res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());
}

async function register(req, res, next) {
  try {
    const { username, email, password, firstName, lastName } = req.body;

    // Check if user exists
    const existingUser = await userService.findByUsername(username);
    if (existingUser) {
      return res.status(409).json({ error: 'Username already taken' });
    }
    const existingEmail = await userService.findByEmail(email);
    if (existingEmail) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const user = await userService.createUser({ username, email, password, firstName, lastName });
    const registeredUser = { ...user, role: 'user' };
    const token = jwt.sign({ id: user.id, username: user.username, role: 'user' }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
    setAuthCookie(res, token);

    res.status(201).json({ user: registeredUser });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { username, password } = req.body;

    const user = await userService.findByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await userService.verifyPassword(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );
    setAuthCookie(res, token);

    res.json({
      user: { id: user.id, username: user.username, email: user.email, role: user.role, first_name: user.first_name, last_name: user.last_name },
    });
  } catch (err) {
    next(err);
  }
}

async function getProfile(req, res, next) {
  try {
    const user = await userService.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

async function logout(req, res) {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.server.env === 'production',
    path: '/',
  });
  res.json({ success: true });
}

module.exports = { register, login, getProfile, logout };
