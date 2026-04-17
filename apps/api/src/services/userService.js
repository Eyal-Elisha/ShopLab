// ============================================================
// User Service — Raw SQL queries for user operations
// ============================================================
const { query } = require('./db');
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;

/**
 * Find user by username.
 */
async function findByUsername(username) {
  const sql = 'SELECT u.*, ur.role FROM users u LEFT JOIN user_roles ur ON u.id = ur.user_id WHERE u.username = $1';
  const result = await query(sql, [username]);
  return result.rows[0] || null;
}

async function findByEmail(email) {
  const sql = 'SELECT u.*, ur.role FROM users u LEFT JOIN user_roles ur ON u.id = ur.user_id WHERE u.email = $1';
  const result = await query(sql, [email]);
  return result.rows[0] || null;
}

async function findById(id) {
  const sql = 'SELECT u.id, u.username, u.email, u.first_name, u.last_name, u.created_at, ur.role FROM users u LEFT JOIN user_roles ur ON u.id = ur.user_id WHERE u.id = $1';
  const result = await query(sql, [id]);
  return result.rows[0] || null;
}

async function createUser({ username, email, password, firstName, lastName }) {
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const sql = `INSERT INTO users (username, email, password_hash, first_name, last_name)
               VALUES ($1, $2, $3, $4, $5) RETURNING id, username, email, first_name, last_name, created_at`;
  const result = await query(sql, [username, email, passwordHash, firstName, lastName]);
  
  // Assign default 'user' role
  await query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2)', [result.rows[0].id, 'user']);
  
  return result.rows[0];
}

async function verifyPassword(plaintext, hash) {
  return bcrypt.compare(plaintext, hash);
}

async function getAllUsers() {
  const sql = 'SELECT u.id, u.username, u.email, u.first_name, u.last_name, u.created_at, ur.role FROM users u LEFT JOIN user_roles ur ON u.id = ur.user_id ORDER BY u.created_at DESC';
  const result = await query(sql);
  return result.rows;
}

async function updateUserRole(userId, role) {
  const userCheck = await query('SELECT id FROM users WHERE id = $1', [userId]);
  if (userCheck.rows.length === 0) return null;

  // user_roles has UNIQUE(user_id, role) rather than UNIQUE(user_id), so
  // we can't rely on ON CONFLICT (user_id). Replace the row instead.
  await query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
  const result = await query(
    'INSERT INTO user_roles (user_id, role) VALUES ($1, $2) RETURNING *',
    [userId, role]
  );
  return result.rows[0];
}

async function updateProfile(userId, { firstName, lastName }) {
  const fields = [];
  const values = [];
  let idx = 1;

  if (firstName !== undefined) {
    fields.push(`first_name = $${idx++}`);
    values.push(firstName);
  }
  if (lastName !== undefined) {
    fields.push(`last_name = $${idx++}`);
    values.push(lastName);
  }

  if (fields.length === 0) return;

  values.push(userId);
  await query(
    `UPDATE users SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx}`,
    values
  );
}

module.exports = { findByUsername, findByEmail, findById, createUser, verifyPassword, getAllUsers, updateUserRole, updateProfile };
