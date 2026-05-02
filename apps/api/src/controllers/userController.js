const userService = require('../services/userService');

async function getMe(req, res, next) {
  try {
    const user = await userService.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({ user });
  } catch (err) {
    next(err);
  }
}

async function updateMe(req, res, next) {
  try {
    const userId = req.user.id;
    const { username, email } = req.body;
    const allowedFields = new Set(['username', 'email']);
    const unsupportedField = Object.keys(req.body).find((field) => !allowedFields.has(field));

    if (unsupportedField) {
      return res.status(400).json({ error: `Unsupported profile field: ${unsupportedField}` });
    }

    const usernameTaken = await userService.findByUsernameExceptId(username, userId);
    if (usernameTaken) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const emailTaken = await userService.findByEmailExceptId(email, userId);
    if (emailTaken) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const updatedUser = await userService.updateOwnProfile(userId, { username, email });
    if (!updatedUser) return res.status(404).json({ error: 'User not found' });

    const user = await userService.findById(updatedUser.id);
    res.json({ user, message: 'Profile updated' });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Username or email already in use' });
    }

    next(err);
  }
}

async function updatePassword(req, res, next) {
  try {
    const allowedFields = new Set(['currentPassword', 'newPassword']);
    const unsupportedField = Object.keys(req.body).find((field) => !allowedFields.has(field));

    if (unsupportedField) {
      return res.status(400).json({ error: `Unsupported password field: ${unsupportedField}` });
    }

    const user = await userService.findAuthById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const valid = await userService.verifyPassword(req.body.currentPassword, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    await userService.updatePassword(req.user.id, req.body.newPassword);
    res.json({ message: 'Password updated' });
  } catch (err) {
    next(err);
  }
}

const PREFS_COOKIE = 'shoplab_prefs';

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return Object.fromEntries(
    header.split(';')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const idx = s.indexOf('=');
        return idx === -1 ? [s, ''] : [s.slice(0, idx), decodeURIComponent(s.slice(idx + 1))];
      })
  );
}

function prefsCookieOptions() {
  return {
    httpOnly: false, // Intentionally readable by JS — the cookie is the attack surface
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

async function setPreferences(req, res) {
  // Only 'theme' is a real user setting. Currency and language are out of scope for now.
  // Valid values: 'light' | 'dark'. Anything else defaults to 'light'.
  const theme = req.body.theme === 'dark' ? 'dark' : 'light';

  // VULNERABILITY: the role is embedded in the serialized cookie and later trusted
  // without any signature or integrity check.
  const prefs = {
    theme,
    role: req.user.role,   // pulled from verified JWT — but then stored client-side
    userId: req.user.id,
  };

  const encoded = Buffer.from(JSON.stringify(prefs)).toString('base64');
  res.cookie(PREFS_COOKIE, encoded, prefsCookieOptions());
  res.json({ message: 'Preferences saved', prefs });
}

async function getPreferences(req, res) {
  const raw = parseCookies(req)[PREFS_COOKIE];
  if (!raw) {
    return res.json({
      message: 'No preferences set yet. POST to /api/user/me/preferences first.',
      prefs: null,
    });
  }

  try {
    const prefs = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    res.json({ prefs, raw });
  } catch {
    res.status(400).json({ error: 'Malformed preferences cookie.' });
  }
}

async function getVipFlag(req, res) {
  const raw = parseCookies(req)[PREFS_COOKIE];
  if (!raw) {
    return res.status(403).json({
      error: 'No preferences cookie found.',
      hint: 'Set your preferences first by POSTing to /api/user/me/preferences.',
    });
  }

  let prefs;
  try {
    prefs = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Malformed preferences cookie.' });
  }

  // VULNERABILITY: trusts the role from the client-controlled cookie
  if (prefs.role !== 'admin') {
    return res.status(403).json({
      error: 'VIP access is for administrators only.',
      message: `Your current role is: "${prefs.role}". You know what to do.`,
    });
  }

  res.json({
    flag: 'SHOPLAB{pr3fs_s3r14l1z4t10n_t4mp3r}',
    message: "Welcome to the VIP lounge. You tampered with a cookie the server should never have trusted.",
    prefs,
  });
}

module.exports = { getMe, updateMe, updatePassword, getPreferences, setPreferences, getVipFlag };
