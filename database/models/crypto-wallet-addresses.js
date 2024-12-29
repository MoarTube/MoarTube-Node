const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const CryptoWalletAddresses = sequelize.define('CryptoWalletAddress', {
    wallet_address_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    wallet_address: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    chain: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    chain_id: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    currency: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    timestamp: {
        type: DataTypes.BIGINT,
        allowNull: false
    }
}, {
    tableName: 'cryptowalletaddresses',
    timestamps: false
});

module.exports = CryptoWalletAddresses;
