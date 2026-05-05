const { query } = require('../services/db');

const BOLA_FLAG = 'SHOPLAB{BOLA_HIDDEN_IN_NETWORK_TAB}';

async function getProfileById(req, res, next) {
  try {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: 'Valid user id required' });
    }

    const result = await query(
      `SELECT u.id, u.username, u.email, u.first_name, u.last_name,
              u.created_at, u.updated_at, ur.role
       FROM users u
       LEFT JOIN user_roles ur ON u.id = ur.user_id
       WHERE u.id = $1`,
      [userId]
    );
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.username === 'admin' || user.username === 'support') {
      user.internal_flag = BOLA_FLAG;
    }

    res.json({ user });
  } catch (err) {
    next(err);
  }
}

module.exports = { getProfileById };
