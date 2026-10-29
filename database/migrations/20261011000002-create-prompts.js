module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Prompts', {
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
      type: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      systemPrompt: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      userPromptTemplate: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      config: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      version: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
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
    await queryInterface.dropTable('Prompts');
  },
};
