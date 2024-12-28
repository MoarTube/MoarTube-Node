const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const Video = sequelize.define('Video', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    video_id: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    source_file_extension: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    title: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    tags: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    length_seconds: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    length_timestamp: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    views: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    comments: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    likes: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    dislikes: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    bandwidth: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    is_importing: {
        type: DataTypes.BOOLEAN,
        allowNull: false
    },
    is_imported: {
        type: DataTypes.BOOLEAN,
        allowNull: false
    },
    is_publishing: {
        type: DataTypes.BOOLEAN,
        allowNull: false
    },
    is_published: {
        type: DataTypes.BOOLEAN,
        allowNull: false
    },
    is_streaming: {
        type: DataTypes.BOOLEAN,
        allowNull: false
    },
    is_streamed: {
        type: DataTypes.BOOLEAN,
        allowNull: false
    },
    is_stream_recorded_remotely: {
        type: DataTypes.BOOLEAN,
        allowNull: false
    },
    is_stream_recorded_locally: {
        type: DataTypes.BOOLEAN,
        allowNull: false
    },
    is_live: {
        type: DataTypes.BOOLEAN,
        allowNull: false
    },
    is_indexing: {
        type: DataTypes.BOOLEAN,
        allowNull: false
    },
    is_indexed: {
        type: DataTypes.BOOLEAN,
        allowNull: false
    },
    is_index_outdated: {
        type: DataTypes.BOOLEAN,
        allowNull: false
    },
    is_error: {
        type: DataTypes.BOOLEAN,
        allowNull: false
    },
    is_finalized: {
        type: DataTypes.BOOLEAN,
        allowNull: false
    },
    is_hidden: {
        type: DataTypes.BOOLEAN,
        allowNull: false
    },
    is_passworded: {
        type: DataTypes.BOOLEAN,
        allowNull: false
    },
    password: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    is_comments_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false
    },
    is_likes_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false
    },
    is_dislikes_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false
    },
    is_reports_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false
    },
    is_live_chat_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false
    },
    meta: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    creation_timestamp: {
        type: DataTypes.BIGINT,
        allowNull: false
    },
}, {
    tableName: 'videos',
    timestamps: false
});

module.exports = Video;
