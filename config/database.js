require('dotenv').config();
const path = require('path');
const fs = require('fs');

const dialect = process.env.DB_DIALECT || 'sqlite';
const storage = process.env.DB_STORAGE
  ? path.resolve(process.env.DB_STORAGE)
  : path.resolve(__dirname, '..', 'data', 'assistance.sqlite');

if (dialect === 'sqlite') {
  const dataDir = path.dirname(storage);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

const baseConfig = {
  dialect,
  storage,
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'assistance_schedule',
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  logging: process.env.DB_LOGGING === 'true' ? console.log : false,
};

module.exports = {
  development: { ...baseConfig },
  test: { ...baseConfig, storage: ':memory:' },
  production: { ...baseConfig },
  baseConfig,
};
