const { Model, DataTypes } = require('sequelize');

class BotConfig extends Model {
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
        botToken: {
          type: DataTypes.STRING(255),
          allowNull: false,
        },
        botUsername: {
          type: DataTypes.STRING(100),
          allowNull: true,
        },
        allowedUsers: {
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
        modelName: 'BotConfig',
        tableName: 'BotConfigs',
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

module.exports = BotConfig;
