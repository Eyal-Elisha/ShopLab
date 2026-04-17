const morgan = require('morgan');

// Simple request logging
const requestLogger = morgan(':method :url :status :response-time ms - :res[content-length]');

module.exports = { requestLogger };
