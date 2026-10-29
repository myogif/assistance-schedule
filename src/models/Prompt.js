const { Model, DataTypes } = require('sequelize');

class Prompt extends Model {
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
          allowNull: false,
          references: {
            model: 'Niches',
            key: 'id',
          },
          onDelete: 'CASCADE',
        },
        type: {
          type: DataTypes.STRING(50),
          allowNull: false,
        },
        name: {
          type: DataTypes.STRING(100),
          allowNull: false,
        },
        systemPrompt: {
          type: DataTypes.TEXT,
          allowNull: false,
        },
        userPromptTemplate: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        config: {
          type: DataTypes.JSON,
          allowNull: true,
        },
        version: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 1,
        },
        isActive: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
      },
      {
        sequelize,
        modelName: 'Prompt',
        tableName: 'Prompts',
        timestamps: true,
      },
    );
  }

  static associate(models) {
    this.belongsTo(models.Niche, {
      foreignKey: 'nicheId',
      as: 'niche',
      onDelete: 'CASCADE',
    });
  }
}

module.exports = Prompt;
