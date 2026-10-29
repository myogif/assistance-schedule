require('dotenv').config();
const app = require('./app');
const { sequelize } = require('./models');

const PORT = process.env.PORT || 4000;

let server;

async function startServer() {
  try {
    // 1. Verify database connectivity
    await sequelize.authenticate();
    console.log('Database connected successfully.');

    // 2. Start HTTP listener
    server = app.listen(PORT, () => {
      console.log('===============================================');
      console.log('  Assistance Schedule Express REST API');
      console.log(`  Server running on http://localhost:${PORT}`);
      console.log(`  Media static path: http://localhost:${PORT}/media/`);
      console.log(`  API v1 prefix:     http://localhost:${PORT}/api/v1/`);
      console.log(`  Swagger UI:        http://localhost:${PORT}/api-docs/`);
      console.log('===============================================');
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

// Graceful shutdown handling
function handleShutdown(signal) {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  if (server) {
    server.close(async () => {
      console.log('HTTP server closed.');
      try {
        await sequelize.close();
        console.log('Database connection closed.');
      } catch (err) {
        console.error('Error closing database connection:', err.message);
      }
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

if (require.main === module) {
  startServer();
}

module.exports = {
  startServer,
  app,
};
