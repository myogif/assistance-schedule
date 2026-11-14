const { Model, DataTypes } = require('sequelize');

class NewsQueueJob extends Model {
  static initModel(sequelize) {
    return this.init(
      {
        id: {
          type: DataTypes.INTEGER,
          autoIncrement: true,
          primaryKey: true,
        },
        jobId: {
          type: DataTypes.STRING(64),
          allowNull: false,
          unique: true,
        },
        url: {
          type: DataTypes.TEXT,
          allowNull: false,
        },
        status: {
          type: DataTypes.STRING(50),
          allowNull: false,
          defaultValue: 'queued', // queued | processing | completed | failed
        },
        stage: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 1,
        },
        stageName: {
          type: DataTypes.STRING(50),
          allowNull: false,
          defaultValue: 'INGESTION',
        },
        attempts: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        error: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        result: {
          type: DataTypes.JSON,
          allowNull: true,
        },
        logs: {
          type: DataTypes.JSON,
          allowNull: true,
          defaultValue: [],
        },
      },
      {
        sequelize,
        modelName: 'NewsQueueJob',
        tableName: 'NewsQueueJobs',
        timestamps: true,
        indexes: [
          { fields: ['jobId'], unique: true },
          { fields: ['status'] },
        ],
      },
    );
  }

  static associate() {
    // Association hooks
  }
}

module.exports = NewsQueueJob;
