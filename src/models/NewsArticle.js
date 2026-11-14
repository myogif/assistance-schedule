const { Model, DataTypes } = require('sequelize');

class NewsArticle extends Model {
  static initModel(sequelize) {
    return this.init(
      {
        id: {
          type: DataTypes.INTEGER,
          autoIncrement: true,
          primaryKey: true,
        },
        articleId: {
          type: DataTypes.STRING(64),
          allowNull: false,
          unique: true,
        },
        canonicalUrl: {
          type: DataTypes.TEXT,
          allowNull: false,
        },
        originalUrl: {
          type: DataTypes.TEXT,
          allowNull: false,
        },
        sourceName: {
          type: DataTypes.STRING(100),
          allowNull: false,
        },
        sourceDomain: {
          type: DataTypes.STRING(100),
          allowNull: false,
        },
        sourceType: {
          type: DataTypes.STRING(50),
          allowNull: false,
          defaultValue: 'generic_web',
        },
        title: {
          type: DataTypes.TEXT,
          allowNull: false,
        },
        subtitle: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        description: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        author: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        articleContent: {
          type: DataTypes.TEXT,
          allowNull: false,
        },
        images: {
          type: DataTypes.JSON,
          allowNull: true,
          defaultValue: [],
        },
        language: {
          type: DataTypes.STRING(10),
          allowNull: false,
          defaultValue: 'id',
        },
        publishedAt: {
          type: DataTypes.DATE,
          allowNull: true,
        },
        updatedAtSource: {
          type: DataTypes.DATE,
          allowNull: true,
        },
        firstSeenAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
        scrapedAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
        companies: {
          type: DataTypes.JSON,
          allowNull: true,
          defaultValue: [],
        },
        stockTickers: {
          type: DataTypes.JSON,
          allowNull: true,
          defaultValue: [],
        },
        people: {
          type: DataTypes.JSON,
          allowNull: true,
          defaultValue: [],
        },
        sectors: {
          type: DataTypes.JSON,
          allowNull: true,
          defaultValue: [],
        },
        extractionMethod: {
          type: DataTypes.STRING(50),
          allowNull: false,
          defaultValue: 'dom_fallback',
        },
        extractionConfidence: {
          type: DataTypes.FLOAT,
          allowNull: false,
          defaultValue: 0.0,
        },
        extractionStatus: {
          type: DataTypes.STRING(50),
          allowNull: false,
          defaultValue: 'success',
        },
        extractionWarnings: {
          type: DataTypes.JSON,
          allowNull: true,
          defaultValue: [],
        },
        rawPayload: {
          type: DataTypes.JSON,
          allowNull: true,
        },
      },
      {
        sequelize,
        modelName: 'NewsArticle',
        tableName: 'NewsArticles',
        timestamps: true,
        indexes: [
          { fields: ['articleId'], unique: true },
          { fields: ['sourceDomain'] },
          { fields: ['publishedAt'] },
        ],
      },
    );
  }

  static associate() {
    // Association hooks if needed
  }
}

module.exports = NewsArticle;
