const sqlite3 = require('sqlite3').verbose();
const { v1: uuidv1, v4: uuidv4 } = require('uuid');

const { logDebugMessageToConsole, getDatabaseFilePath } = require("./helpers");

let database;
let PENDING_DATABASE_WRITE_JOBS = {};

function provisionSqliteDatabase() {
    return new Promise(function(resolve, reject) {
        logDebugMessageToConsole('provisioning SQLite3 database', null, null, true);
        
        database = new sqlite3.Database(getDatabaseFilePath(), function(error) {
            if (error) {
                logDebugMessageToConsole(null, error, new Error().stack, true);
                
                reject();
            }
            else {
                database.run('PRAGMA journal_mode=WAL', function (error) {
                    if (error) {
                        logDebugMessageToConsole(null, error, new Error().stack, true);
                        
                        reject();
                    } else {
                        database.run('CREATE TABLE IF NOT EXISTS videos(id INTEGER PRIMARY KEY, video_id TEXT, source_file_extension TEXT, title TEXT, description TEXT, tags TEXT, length_seconds INTEGER, length_timestamp INTEGER, views INTEGER, comments INTEGER, likes INTEGER, dislikes INTEGER, bandwidth INTEGER, is_importing INTEGER, is_imported INTEGER, is_publishing INTEGER, is_published INTEGER, is_streaming INTEGER, is_streamed INTEGER, is_stream_recorded_remotely INTEGER, is_stream_recorded_locally INTEGER, is_live INTEGER, is_indexed INTEGER, is_index_outdated INTEGER, is_error INTEGER, is_finalized INTEGER, meta TEXT, creation_timestamp INTEGER)', function (error) {
                            if (error) {
                                logDebugMessageToConsole(null, error, new Error().stack, true);
                                
                                reject();
                            } else {
                                database.run('CREATE TABLE IF NOT EXISTS videoIdProofs(id INTEGER PRIMARY KEY, video_id TEXT, video_id_proof TEXT)', function (error) {
                                    if (error) {
                                        logDebugMessageToConsole(null, error, new Error().stack, true);
                                        
                                        reject();
                                    } else {
                                        database.run('CREATE TABLE IF NOT EXISTS comments(id INTEGER PRIMARY KEY, video_id TEXT, comment_plain_text_sanitized TEXT, timestamp INTEGER)', function (error) {
                                            if (error) {
                                                logDebugMessageToConsole(null, error, new Error().stack, true);
                                                
                                                reject();
                                            } else {
                                                database.run('CREATE TABLE IF NOT EXISTS videoReports(report_id INTEGER PRIMARY KEY, timestamp INTEGER, video_timestamp INTEGER, video_id TEXT, email TEXT, type TEXT, message TEXT)', function (error) {
                                                    if (error) {
                                                        logDebugMessageToConsole(null, error, new Error().stack, true);
                                                        
                                                        reject();
                                                    } else {
                                                        database.run('CREATE TABLE IF NOT EXISTS commentReports(report_id INTEGER PRIMARY KEY, timestamp INTEGER, comment_timestamp INTEGER, video_id TEXT, comment_id TEXT, email TEXT, type TEXT, message TEXT)', function (error) {
                                                            if (error) {
                                                                logDebugMessageToConsole(null, error, new Error().stack, true);
                                                                
                                                                reject();
                                                            } else {
                                                                database.run('CREATE TABLE IF NOT EXISTS videoReportsArchive(archive_id INTEGER PRIMARY KEY, report_id INTEGER, timestamp INTEGER, video_timestamp INTEGER, video_id TEXT, email TEXT, type TEXT, message TEXT)', function (error) {
                                                                    if (error) {
                                                                        logDebugMessageToConsole(null, error, new Error().stack, true);
                                                                        
                                                                        reject();
                                                                    } else {
                                                                        database.run('CREATE TABLE IF NOT EXISTS commentReportsArchive(archive_id INTEGER PRIMARY KEY, report_id INTEGER, timestamp INTEGER, comment_timestamp INTEGER, video_id TEXT, comment_id TEXT, email TEXT, type TEXT, message TEXT)', function (error) {
                                                                            if (error) {
                                                                                logDebugMessageToConsole(null, error, new Error().stack, true);
                                                                                
                                                                                reject();
                                                                            } else {
                                                                                database.run('CREATE TABLE IF NOT EXISTS liveChatMessages(chat_message_id INTEGER PRIMARY KEY, video_id TEXT, username TEXT, username_color_hex_code TEXT, chat_message TEXT, timestamp INTEGER)', function (error) {
                                                                                    if (error) {
                                                                                        logDebugMessageToConsole(null, error, new Error().stack, true);
                                                                                        
                                                                                        reject();
                                                                                    } else {
                                                                                        database.run('UPDATE videos SET is_streamed = ? WHERE is_streaming = ?', [1, 1], function (error) {
                                                                                            if (error) {
                                                                                                logDebugMessageToConsole(null, error, new Error().stack, true);
                                                                                                
                                                                                                reject();
                                                                                            } else {
                                                                                                database.run('UPDATE videos SET is_importing = ?, is_publishing = ?, is_streaming = ?', [0, 0, 0], async function (error) {
                                                                                                    if (error) {
                                                                                                        logDebugMessageToConsole(null, error, new Error().stack, true);

                                                                                                        reject();
                                                                                                    } else {
                                                                                                        await performDatabaseMaintenance();

                                                                                                        logDebugMessageToConsole('provisioned SQLite3 database', null, null, true);

                                                                                                        resolve();
                                                                                                    }
                                                                                                });
                                                                                            }
                                                                                        });
                                                                                    }
                                                                                });
                                                                            }
                                                                        });
                                                                    }
                                                                });
                                                            }
                                                        });
                                                    }
                                                });
                                            }
                                        });
                                    }
                                });
                            }
                        });
                    }
                });
            }
        });
    });
}

function performDatabaseMaintenance() {
    return new Promise(function(resolve, reject) {
        database.run('DELETE FROM liveChatMessages', function(error) {
            if(error) {
                reject();
            }
            else {
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
    
    process.send({ cmd: 'database_write_job', query: query, parameters: parameters, databaseWriteJobId: databaseWriteJobId });
}

function getDatabase() {
    return database;
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
    getDatabase,
    finishPendingDatabaseWriteJob
};