// ============================================================
// Centralized Error Handler
// ============================================================
const config = require('../config');

function errorHandler(err, req, res, next) {
  console.error('[ERROR]', err.message);

  const status = err.status || 500;
  const response = {
    error: err.message || 'Internal server error',
  };

  if (config.logging.verboseErrors) {
    response.stack = err.stack;
    response.query = err.query;
    response.detail = err.detail;
  }

  res.status(status).json(response);
}

module.exports = errorHandler;
