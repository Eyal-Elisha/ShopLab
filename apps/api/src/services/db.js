// ============================================================
// Database Connection Pool — Raw SQL interface
// ============================================================
const { Pool } = require('pg');
const config = require('../config');

const pool = new Pool(config.db);

/**
 * Execute a parameterized SQL query.
 */
async function query(text, params = []) {
  if (config.logging.logQueries) {
    console.log('[SQL]', text, params);
  }
  const result = await pool.query(text, params);
  return result;
}

module.exports = { query, pool };
