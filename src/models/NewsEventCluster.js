const { Model, DataTypes } = require('sequelize');

class NewsEventCluster extends Model {
  static initModel(sequelize) {
    return this.init(
      {
        id: {
          type: DataTypes.INTEGER,
          autoIncrement: true,
          primaryKey: true,
        },
        clusterId: {
          type: DataTypes.STRING(64),
          allowNull: false,
          unique: true,
        },
        topicTitle: {
          type: DataTypes.TEXT,
          allowNull: false,
        },
        primaryEntity: {
          type: DataTypes.STRING(100),
          allowNull: false,
        },
        eventCategory: {
          type: DataTypes.STRING(100),
          allowNull: false,
        },
        articles: {
          type: DataTypes.JSON,
          allowNull: false,
          defaultValue: [],
        },
      },
      {
        sequelize,
        modelName: 'NewsEventCluster',
        tableName: 'NewsEventClusters',
        timestamps: true,
        indexes: [
          { fields: ['clusterId'], unique: true },
          { fields: ['primaryEntity'] },
        ],
      },
    );
  }

  static associate() {
    // Association hooks
  }
}

module.exports = NewsEventCluster;
