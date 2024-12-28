const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const Links = sequelize.define('link', {
    link_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    url: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    svg_graphic: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    timestamp: {
        type: DataTypes.BIGINT,
        allowNull: false
    }
}, {
    tableName: 'links',
    timestamps: false
});

module.exports = Links;
