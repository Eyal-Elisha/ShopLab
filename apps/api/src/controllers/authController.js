const jwt = require('jsonwebtoken');
const config = require('../config');
const userService = require('../services/userService');
const blindSqlInjectionService = require('../services/blindSqlInjectionService');
const { setAuthCookie, setRememberCookie, clearAuthCookies } = require('../services/authCookieService');

async function register(req, res, next) {
  try {
    const { username, email, password, firstName, lastName } = req.body;

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
    const { username, password, rememberMe } = req.body;

    const result = await blindSqlInjectionService.unsafeLogin(username, password);
    if (!result.success) {
      return res.status(401).json({ error: result.message });
    }
    const user = result.user;

    if (!isExactLogin(user, username, password)) {
      return res.json({  });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );
    setAuthCookie(res, token);
    if (rememberMe) setRememberCookie(res, user);

    res.json({
      user: { id: user.id, username: user.username, email: user.email, role: user.role, first_name: user.first_name, last_name: user.last_name },
    });
  } catch (err) {
    next(err);
  }
}

function isExactLogin(user, username, password) {
  return user.username === username && user.password === password;
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
  clearAuthCookies(res);
  res.json({ success: true });
}

async function getJwtFlag(req, res) {
  // If the user bypassed signature verification using alg:none, they are halfway there.
  // We strictly require the forged token to also claim the 'admin' role.
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Insufficient permissions',
      message: 'You managed to authenticate, but only an admin can see this flag. Try forging your role too.'
    });
  }

  res.json({
    flag: 'SHOPLAB{jwt_n0n3_alg_bYp4ss_auth}',
    message: "Welcome, ghost. You forged your way in and claimed the throne. That's a complete JWT compromise.",
    user: req.user,
  });
}

module.exports = { register, login, getProfile, logout, getJwtFlag };
