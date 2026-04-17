// Centralized configuration — loaded from .env
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:8080')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

module.exports = {
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'ecommerce_lab',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'fallback-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },
  server: {
    port: parseInt(process.env.PORT) || 3001,
    env: process.env.NODE_ENV || 'development',
    corsOrigins,
  },
  logging: {
    logQueries: process.env.LOG_QUERIES === 'true',
    verboseErrors: process.env.VERBOSE_ERRORS === 'true',
  },
};
