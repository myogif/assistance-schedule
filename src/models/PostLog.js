const { Model, DataTypes } = require('sequelize');

class PostLog extends Model {
  static initModel(sequelize) {
    return this.init(
      {
        id: {
          type: DataTypes.INTEGER,
          primaryKey: true,
          autoIncrement: true,
        },
        nicheId: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: {
            model: 'Niches',
            key: 'id',
          },
          onDelete: 'SET NULL',
        },
        articleTitle: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        articleSource: {
          type: DataTypes.STRING(100),
          allowNull: true,
        },
        articleUrl: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        articleContent: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        extractedData: {
          type: DataTypes.JSON,
          allowNull: true,
        },
        generatedPrompt: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        imagePath: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        caption: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        zernioPostId: {
          type: DataTypes.STRING(100),
          allowNull: true,
        },
        zernioStatus: {
          type: DataTypes.STRING(50),
          allowNull: true,
        },
        zernioPlatformPostUrl: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        zernioResponse: {
          type: DataTypes.JSON,
          allowNull: true,
        },
        status: {
          type: DataTypes.STRING(30),
          allowNull: false,
          defaultValue: 'pending',
        },
        error: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        triggeredBy: {
          type: DataTypes.STRING(100),
          allowNull: true,
        },
      },
      {
        sequelize,
        modelName: 'PostLog',
        tableName: 'PostLogs',
        timestamps: true,
      },
    );
  }

  static associate(models) {
    this.belongsTo(models.Niche, {
      foreignKey: 'nicheId',
      as: 'niche',
      onDelete: 'SET NULL',
    });
  }
}

module.exports = PostLog;
