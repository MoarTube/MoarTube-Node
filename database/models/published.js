const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const Published = sequelize.define('publish', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    video_id: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    format: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    resolution: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    timestamp: {
        type: DataTypes.BIGINT,
        allowNull: false
    }
}, {
    tableName: 'published',
    timestamps: false,
    indexes: [
        {
            unique: true,
            fields: ['video_id', 'format', 'resolution']
        }
    ]
});

module.exports = Published;
