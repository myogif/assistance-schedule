module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('PostLogs', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      nicheId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'Niches',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      articleTitle: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      articleSource: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      articleUrl: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      articleContent: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      extractedData: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      generatedPrompt: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      imagePath: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      caption: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      zernioPostId: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      zernioStatus: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      zernioPlatformPostUrl: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      zernioResponse: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      status: {
        type: Sequelize.STRING(30),
        allowNull: false,
        defaultValue: 'pending',
      },
      error: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      triggeredBy: {
        type: Sequelize.STRING(100),
        allowNull: true,
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
    await queryInterface.dropTable('PostLogs');
  },
};
