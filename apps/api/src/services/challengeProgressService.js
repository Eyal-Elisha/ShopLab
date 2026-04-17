const { query } = require("./db");

async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS user_challenge_progress (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
      challenge_slug VARCHAR(100) NOT NULL,
      solved_at TIMESTAMP,
      last_attempt_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, challenge_slug)
    )
  `);

  await query(`
    ALTER TABLE user_challenge_progress
    ALTER COLUMN solved_at DROP DEFAULT
  `);
}

async function getProgressByUser(userId) {
  if (!userId) {
    return new Map();
  }

  const result = await query(
    `
      SELECT challenge_slug, solved_at
      FROM user_challenge_progress
      WHERE user_id = $1
    `,
    [userId]
  );

  return new Map(result.rows.map((row) => [row.challenge_slug, row.solved_at]));
}

async function recordAttempt(userId, challengeSlug) {
  if (!userId) {
    return;
  }

  await query(
    `
      INSERT INTO user_challenge_progress (user_id, challenge_slug, last_attempt_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (user_id, challenge_slug)
      DO UPDATE SET last_attempt_at = NOW()
    `,
    [userId, challengeSlug]
  );
}

async function markSolved(userId, challengeSlug) {
  await query(
    `
      INSERT INTO user_challenge_progress (user_id, challenge_slug, solved_at, last_attempt_at)
      VALUES ($1, $2, NOW(), NOW())
      ON CONFLICT (user_id, challenge_slug)
      DO UPDATE SET solved_at = COALESCE(user_challenge_progress.solved_at, NOW()), last_attempt_at = NOW()
    `,
    [userId, challengeSlug]
  );

  const result = await query(
    `
      SELECT solved_at
      FROM user_challenge_progress
      WHERE user_id = $1 AND challenge_slug = $2
    `,
    [userId, challengeSlug]
  );

  return result.rows[0]?.solved_at || null;
}

module.exports = {
  ensureTable,
  getProgressByUser,
  recordAttempt,
  markSolved,
};
