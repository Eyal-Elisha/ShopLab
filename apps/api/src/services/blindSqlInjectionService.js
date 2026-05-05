const { query } = require('./db');

const FLAG = 'SHOPLAB{bl1nd_b00l34n_l0g1n}';

async function ensureTable() {
  await query('DROP SCHEMA IF EXISTS blind_sqli CASCADE');
  await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS rowid INTEGER');
  await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS password TEXT');
  await query('ALTER TABLE users DROP COLUMN IF EXISTS password_hash');
  await query('UPDATE users SET rowid = id WHERE rowid IS NULL');
  await query("UPDATE users SET password = username || '_password' WHERE password IS NULL");
  await query('UPDATE users SET password = $1 WHERE username = $2', [FLAG, 'admin']);
}

async function unsafeLogin(username = '', password = '') {
  const sql =
    `SELECT rowid, * FROM users ` +
    `WHERE username = '${username}' AND password = '${password}'`;

  try {
    // Intentionally vulnerable for the Blind SQL Injection (Hard) CTF route.
    const result = await query(sql);
    const user = result.rows[0];
    if (!user) return invalid();

    const roleResult = await query('SELECT role FROM user_roles WHERE user_id = $1 LIMIT 1', [user.id]);
    return { success: true, message: '', user: { ...user, role: roleResult.rows[0]?.role || 'user' } };
  } catch (error) {
    return invalid();
  }
}

function invalid() {
  return { success: false, message: 'Invalid username or password' };
}

module.exports = { ensureTable, unsafeLogin };
