const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v1: uuidv1, v4: uuidv4 } = require('uuid');
const cluster = require('cluster');

const { logDebugMessageToConsole } = require('./logger');
const { getDatabaseFilePath } = require("./paths");

let database;
let PENDING_DATABASE_WRITE_JOBS = {};

function provisionSqliteDatabase() {
    return new Promise(function(resolve, reject) {
        logDebugMessageToConsole('provisioning SQLite3 database', null, null, true);
        
        database = new sqlite3.Database(getDatabaseFilePath(), async function(error) {
            if (error) {
                logDebugMessageToConsole(null, error, new Error().stack, true);
                
                reject();
            }
            else {
                await performDatabaseWriteJob('PRAGMA journal_mode=WAL', []);
                await performDatabaseWriteJob('CREATE TABLE IF NOT EXISTS videos(id INTEGER PRIMARY KEY, video_id TEXT, source_file_extension TEXT, title TEXT, description TEXT, tags TEXT, length_seconds INTEGER, length_timestamp INTEGER, views INTEGER, comments INTEGER, likes INTEGER, dislikes INTEGER, bandwidth INTEGER, is_importing INTEGER, is_imported INTEGER, is_publishing INTEGER, is_published INTEGER, is_streaming INTEGER, is_streamed INTEGER, is_stream_recorded_remotely INTEGER, is_stream_recorded_locally INTEGER, is_live INTEGER, is_indexing INTEGER, is_indexed INTEGER, is_index_outdated INTEGER, is_error INTEGER, is_finalized INTEGER, meta TEXT, creation_timestamp INTEGER)', []);
                await performDatabaseWriteJob('CREATE TABLE IF NOT EXISTS comments(id INTEGER PRIMARY KEY, video_id TEXT, comment_plain_text_sanitized TEXT, timestamp INTEGER)', []);
                await performDatabaseWriteJob('CREATE TABLE IF NOT EXISTS videoReports(report_id INTEGER PRIMARY KEY, timestamp INTEGER, video_timestamp INTEGER, video_id TEXT, email TEXT, type TEXT, message TEXT)', []);
                await performDatabaseWriteJob('CREATE TABLE IF NOT EXISTS commentReports(report_id INTEGER PRIMARY KEY, timestamp INTEGER, comment_timestamp INTEGER, video_id TEXT, comment_id TEXT, email TEXT, type TEXT, message TEXT)', []);
                await performDatabaseWriteJob('CREATE TABLE IF NOT EXISTS videoReportsArchive(archive_id INTEGER PRIMARY KEY, report_id INTEGER, timestamp INTEGER, video_timestamp INTEGER, video_id TEXT, email TEXT, type TEXT, message TEXT)', []);
                await performDatabaseWriteJob('CREATE TABLE IF NOT EXISTS commentReportsArchive(archive_id INTEGER PRIMARY KEY, report_id INTEGER, timestamp INTEGER, comment_timestamp INTEGER, video_id TEXT, comment_id TEXT, email TEXT, type TEXT, message TEXT)', []);
                await performDatabaseWriteJob('CREATE TABLE IF NOT EXISTS liveChatMessages(chat_message_id INTEGER PRIMARY KEY, video_id TEXT, username TEXT, username_color_hex_code TEXT, chat_message TEXT, timestamp INTEGER)', []);
                await performDatabaseWriteJob('UPDATE videos SET is_streamed = ? WHERE is_streaming = ?', [1, 1]);
                await performDatabaseWriteJob('UPDATE videos SET is_importing = ?, is_publishing = ?, is_streaming = ?', [0, 0, 0]);

                await performDatabaseWriteJob('DELETE FROM liveChatMessages', []);

                const { endStreamedHlsManifestFiles, removeOrphanedVideoDirectories } = require('./filesystem');

                await endStreamedHlsManifestFiles();
                await removeOrphanedVideoDirectories();

                logDebugMessageToConsole('provisioned SQLite3 database', null, null, true);

                resolve();
            }
        });
    });
}

function submitDatabaseWriteJob(query, parameters, callback) {
    const databaseWriteJobId = uuidv1() + '-' + uuidv4();
    
    PENDING_DATABASE_WRITE_JOBS[databaseWriteJobId] = {
        callback: callback
    };
    
    if(cluster.isWorker) {
        process.send({ cmd: 'database_write_job', query: query, parameters: parameters, databaseWriteJobId: databaseWriteJobId });
    }
    else {
        performDatabaseWriteJob(query, parameters)
        .then(() => {
            finishPendingDatabaseWriteJob(databaseWriteJobId, false);
        })
        .catch(() => {
            finishPendingDatabaseWriteJob(databaseWriteJobId, true);
        });
    }
}

/* 
calling this function without synchronization risks throwing an SQLite lock exception
*/
function performDatabaseWriteJob(query, parameters) {
    return new Promise(function(resolve, reject) {
        database.run(query, parameters, function(error) {
            if(error) {
                logDebugMessageToConsole(null, error, new Error().stack, true);

                reject();
            }
            else {
                resolve();
            }
        });
    });
}

function performDatabaseReadJob_ALL(query, parameters) {
    return new Promise(function(resolve, reject) {
        database.all(query, parameters, function(error, rows) {
            if(error) {
                logDebugMessageToConsole(null, error, new Error().stack, true);

                reject(error);
            }
            else {
                resolve(rows);
            }
        });
    });
}

function performDatabaseReadJob_GET(query, parameters) {
    return new Promise(function(resolve, reject) {
        database.get(query, parameters, function(error, rows) {
            if(error) {
                logDebugMessageToConsole(null, error, new Error().stack, true);

                reject();
            }
            else {
                resolve(rows);
            }
        });
    });
}

function openDatabase() {
    return new Promise(function(resolve, reject) {
        if(database == null) {
            database = new sqlite3.Database(path.join(getDatabaseFilePath()), function(error) {
                if (error) {
                    logDebugMessageToConsole(null, error, new Error().stack, true);
                    
                    reject();
                }
                else {
                    resolve();
                }
            });
        }
        else {
            resolve();
        }
    });
}

function finishPendingDatabaseWriteJob(databaseWriteJobId, isError) {
    if(PENDING_DATABASE_WRITE_JOBS.hasOwnProperty(databaseWriteJobId)) {
        const pendingDatabaseWriteJob = PENDING_DATABASE_WRITE_JOBS[databaseWriteJobId];
        
        const callback = pendingDatabaseWriteJob.callback;
        
        delete PENDING_DATABASE_WRITE_JOBS[databaseWriteJobId];
        
        if(callback != null) {
            callback(isError);
        }
    }
}

module.exports = {
    provisionSqliteDatabase,
    submitDatabaseWriteJob,
    performDatabaseWriteJob,
    performDatabaseReadJob_ALL,
    performDatabaseReadJob_GET,
    openDatabase,
    finishPendingDatabaseWriteJob
};