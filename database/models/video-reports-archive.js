const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const VideoReportsArchive = sequelize.define('VideoReportsArchive', {
    archive_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    report_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    timestamp: {
        type: DataTypes.BIGINT,
        allowNull: false
    },
    video_timestamp: {
        type: DataTypes.BIGINT,
        allowNull: false
    },
    video_id: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    email: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    type: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    message: {
        type: DataTypes.TEXT,
        allowNull: false
    }
}, {
    tableName: 'videoreportsarchives',
    timestamps: false
});

module.exports = VideoReportsArchive;
