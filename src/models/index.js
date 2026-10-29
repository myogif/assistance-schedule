const { Sequelize } = require('sequelize');
const dbConfig = require('../../config/database');
const Niche = require('./Niche');
const Prompt = require('./Prompt');
const BotConfig = require('./BotConfig');
const PostLog = require('./PostLog');

const env = process.env.NODE_ENV || 'development';
const config = dbConfig[env] || dbConfig.baseConfig;

let sequelize;
if (config.use_env_variable) {
  sequelize = new Sequelize(process.env[config.use_env_variable], config);
} else if (config.dialect === 'sqlite') {
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: config.storage,
    logging: config.logging,
  });
} else {
  sequelize = new Sequelize(
    config.database,
    config.username,
    config.password,
    config,
  );
}

// Enable foreign keys for SQLite
if (sequelize.getDialect() === 'sqlite') {
  sequelize.query('PRAGMA foreign_keys = ON;').catch((err) => {
    console.warn('Failed to enable SQLite foreign keys:', err.message);
  });
}

const models = {
  Niche: Niche.initModel(sequelize),
  Prompt: Prompt.initModel(sequelize),
  BotConfig: BotConfig.initModel(sequelize),
  PostLog: PostLog.initModel(sequelize),
};

Object.values(models).forEach((model) => {
  if (typeof model.associate === 'function') {
    model.associate(models);
  }
});

module.exports = {
  sequelize,
  Sequelize,
  ...models,
};
