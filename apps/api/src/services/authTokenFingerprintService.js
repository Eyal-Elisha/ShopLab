const crypto = require('crypto');
const { getJwtFromRequest } = require('../middleware/auth');

function fromRequest(req) {
  const token = getJwtFromRequest(req);
  return token ? crypto.createHash('sha256').update(token).digest('hex') : null;
}

module.exports = { fromRequest };
