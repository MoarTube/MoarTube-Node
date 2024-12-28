const { Sequelize } = require('sequelize');

const { getDatabaseFilePath } = require("../utils/paths.js");
const { getNodeSettings } = require("../utils/helpers.js");

const nodeSettings = getNodeSettings();

const databaseDialect = nodeSettings.databaseDialect;

let sequelize;

if (databaseDialect === 'sqlite') {
    sequelize = new Sequelize({
        dialect: 'sqlite',
        storage: getDatabaseFilePath(),
        logging: false
    });
} 
else if (databaseDialect === 'postgres') {
    sequelize = new Sequelize('postgres', 'postgres', 'postgres', { // dbName, dbUser, dbPassword
        dialect: 'postgres',
        host: 'localhost',
        port: 5432,
        logging: false
    });
} 
else {
    throw new Error(`Unsupported database dialect: ${databaseDialect}`);
}

module.exports = sequelize;