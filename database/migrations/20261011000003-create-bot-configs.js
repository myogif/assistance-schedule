module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('BotConfigs', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      nicheId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Niches',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      botToken: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      botUsername: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      allowedUsers: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      isActive: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('BotConfigs');
  },
};
