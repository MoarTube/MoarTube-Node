const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const LiveChatMessages = sequelize.define('LiveChatMessages', {
    chat_message_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    video_id: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    username: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    username_color_hex_code: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    chat_message: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    timestamp: {
        type: DataTypes.BIGINT,
        allowNull: false
    }
}, {
    tableName: 'liveChatMessages',
    timestamps: false
});

module.exports = LiveChatMessages;
