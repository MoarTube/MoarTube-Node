const { 
    DataTypes 
} = require('sequelize');

const sequelize = require('../sequelize.js');

const Comment = sequelize.define('Comment', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    video_id: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    comment_plain_text_sanitized: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    timestamp: {
        type: DataTypes.BIGINT,
        allowNull: false
    },
}, {
    tableName: 'comments',
    timestamps: false
});

module.exports = Comment;