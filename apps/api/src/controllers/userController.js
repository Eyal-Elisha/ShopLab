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

module.exports = { getMe, updateMe, updatePassword };
