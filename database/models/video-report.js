const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize.js');

const VideoReport = sequelize.define('VideoReport', {
    report_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
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
    },
}, {
    tableName: 'videoReports',
    timestamps: false
});

module.exports = VideoReport;
