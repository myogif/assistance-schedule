const { Model, DataTypes } = require('sequelize');

class Niche extends Model {
  static initModel(sequelize) {
    return this.init(
      {
        id: {
          type: DataTypes.INTEGER,
          primaryKey: true,
          autoIncrement: true,
        },
        code: {
          type: DataTypes.STRING(50),
          allowNull: false,
          unique: true,
        },
        name: {
          type: DataTypes.STRING(100),
          allowNull: false,
        },
        description: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        isActive: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
      },
      {
        sequelize,
        modelName: 'Niche',
        tableName: 'Niches',
        timestamps: true,
      },
    );
  }

  static associate(models) {
    this.hasMany(models.Prompt, {
      foreignKey: 'nicheId',
      as: 'prompts',
      onDelete: 'CASCADE',
    });
    this.hasMany(models.BotConfig, {
      foreignKey: 'nicheId',
      as: 'botConfigs',
      onDelete: 'CASCADE',
    });
    this.hasMany(models.PostLog, {
      foreignKey: 'nicheId',
      as: 'postLogs',
      onDelete: 'SET NULL',
    });
  }
}

module.exports = Niche;
