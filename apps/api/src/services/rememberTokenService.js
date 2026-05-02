const REMEMBER_COOKIE_NAME = 'save_info';

function createRememberToken(user) {
  const issuedAt = new Date().toISOString();
  const raw = `v1|${user.id}|${user.username}|${issuedAt}`;
  return Buffer.from(raw, 'utf8').toString('base64');
}

function parseRememberToken(token) {
  if (!token || typeof token !== 'string') return null;

  try {
    const raw = Buffer.from(token, 'base64').toString('utf8');
    const [version, idText, username, issuedAt, extra] = raw.split('|');
    const id = Number(idText);
    const issuedAtDate = Date.parse(issuedAt);

    if (
      version !== 'v1' ||
      extra !== undefined ||
      !Number.isInteger(id) ||
      id <= 0 ||
      !username ||
      Number.isNaN(issuedAtDate)
    ) {
      return null;
    }

    return { id, username, role: 'user', authMethod: 'save_info' };
  } catch {
    return null;
  }
}

module.exports = {
  REMEMBER_COOKIE_NAME,
  createRememberToken,
  parseRememberToken,
};
