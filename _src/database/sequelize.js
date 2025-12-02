require('pg').types.setTypeParser(20, (val) => Number(val));

const { 
    Sequelize 
} = require('sequelize');

const { 
    getDatabaseFilePath 
} = require("../utils/paths.js");
const { 
    getNodeSettings 
} = require("../utils/helpers.js");

const nodeSettings = getNodeSettings();

const databaseDialect = nodeSettings.databaseConfig.databaseDialect;

let sequelize;

if (databaseDialect === 'sqlite') {
    sequelize = new Sequelize({
        dialect: 'sqlite',
        storage: getDatabaseFilePath(),
        logging: false
    });
}
else if (databaseDialect === 'postgres') {
    const postgresConfig = nodeSettings.databaseConfig.postgresConfig;

    const databaseName = postgresConfig.databaseName;
    const username = postgresConfig.username;
    const password = postgresConfig.password;
    const host = postgresConfig.host;
    const port = postgresConfig.port;

    sequelize = new Sequelize(databaseName, username, password, {
        dialect: 'postgres',
        host: host,
        port: port,
        logging: false
    });
}
else {
    throw new Error(`Unsupported database dialect: ${databaseDialect}`);
}

module.exports = sequelize;