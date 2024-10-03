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
        logDebugMessageToConsole('provisioning SQLite3 database', null, null);
        
        database = new sqlite3.Database(getDatabaseFilePath(), async function(error) {
            if (error) {
                logDebugMessageToConsole(null, error, new Error().stack);
                
                reject();
            }
            else {
                await performDatabaseWriteJob('PRAGMA journal_mode=WAL', []);

                await vacuumDatabase();

                const didLinksTableExist = ((await performDatabaseReadJob_GET(`SELECT name FROM sqlite_master WHERE type='table' AND name='links';`, [])) != null);
                
                await performDatabaseWriteJob('CREATE TABLE IF NOT EXISTS videos(id INTEGER PRIMARY KEY, video_id TEXT, source_file_extension TEXT, title TEXT, description TEXT, tags TEXT, length_seconds INTEGER, length_timestamp INTEGER, views INTEGER, comments INTEGER, likes INTEGER, dislikes INTEGER, bandwidth INTEGER, is_importing INTEGER, is_imported INTEGER, is_publishing INTEGER, is_published INTEGER, is_streaming INTEGER, is_streamed INTEGER, is_stream_recorded_remotely INTEGER, is_stream_recorded_locally INTEGER, is_live INTEGER, is_indexing INTEGER, is_indexed INTEGER, is_index_outdated INTEGER, is_error INTEGER, is_finalized INTEGER, meta TEXT, creation_timestamp INTEGER)', []);
                await performDatabaseWriteJob('CREATE TABLE IF NOT EXISTS comments(id INTEGER PRIMARY KEY, video_id TEXT, comment_plain_text_sanitized TEXT, timestamp INTEGER)', []);
                await performDatabaseWriteJob('CREATE TABLE IF NOT EXISTS videoReports(report_id INTEGER PRIMARY KEY, timestamp INTEGER, video_timestamp INTEGER, video_id TEXT, email TEXT, type TEXT, message TEXT)', []);
                await performDatabaseWriteJob('CREATE TABLE IF NOT EXISTS commentReports(report_id INTEGER PRIMARY KEY, timestamp INTEGER, comment_timestamp INTEGER, video_id TEXT, comment_id TEXT, email TEXT, type TEXT, message TEXT)', []);
                await performDatabaseWriteJob('CREATE TABLE IF NOT EXISTS videoReportsArchive(archive_id INTEGER PRIMARY KEY, report_id INTEGER, timestamp INTEGER, video_timestamp INTEGER, video_id TEXT, email TEXT, type TEXT, message TEXT)', []);
                await performDatabaseWriteJob('CREATE TABLE IF NOT EXISTS commentReportsArchive(archive_id INTEGER PRIMARY KEY, report_id INTEGER, timestamp INTEGER, comment_timestamp INTEGER, video_id TEXT, comment_id TEXT, email TEXT, type TEXT, message TEXT)', []);
                await performDatabaseWriteJob('CREATE TABLE IF NOT EXISTS liveChatMessages(chat_message_id INTEGER PRIMARY KEY, video_id TEXT, username TEXT, username_color_hex_code TEXT, chat_message TEXT, timestamp INTEGER)', []);
                await performDatabaseWriteJob('CREATE TABLE IF NOT EXISTS cryptoWalletAddresses(wallet_address_id INTEGER PRIMARY KEY, wallet_address TEXT, chain TEXT, chain_id TEXT, currency TEXT, timestamp INTEGER)', []);
                await performDatabaseWriteJob('CREATE TABLE IF NOT EXISTS links(link_id INTEGER PRIMARY KEY, url TEXT, svg_graphic TEXT, timestamp INTEGER)', []);

                await performDatabaseWriteJob('UPDATE videos SET is_streamed = ? WHERE is_streaming = ?', [1, 1]);
                await performDatabaseWriteJob('UPDATE videos SET is_importing = ?, is_publishing = ?, is_streaming = ?', [0, 0, 0]);

                await performDatabaseWriteJob('DELETE FROM liveChatMessages', []);

                const { endStreamedHlsManifestFiles, removeOrphanedVideoDirectories } = require('./filesystem');

                await endStreamedHlsManifestFiles();
                await removeOrphanedVideoDirectories();

                if(!didLinksTableExist) {
                    let url;
                    let svgGraphic;
                    let timestamp = Date.now();

                    url = 'https://github.com/MoarTube';
                    svgGraphic = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-github" viewBox="0 0 16 16"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8"></path></svg>';
                    await performDatabaseWriteJob('INSERT INTO links(url, svg_graphic, timestamp) VALUES (?, ?, ?)', [url, svgGraphic, timestamp]);

                    url = 'https://discord.gg/rrKF7a86rY';
                    svgGraphic = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-discord" viewBox="0 0 16 16"><path d="M13.545 2.907a13.2 13.2 0 0 0-3.257-1.011.05.05 0 0 0-.052.025c-.141.25-.297.577-.406.833a12.2 12.2 0 0 0-3.658 0 8 8 0 0 0-.412-.833.05.05 0 0 0-.052-.025c-1.125.194-2.22.534-3.257 1.011a.04.04 0 0 0-.021.018C.356 6.024-.213 9.047.066 12.032q.003.022.021.037a13.3 13.3 0 0 0 3.995 2.02.05.05 0 0 0 .056-.019q.463-.63.818-1.329a.05.05 0 0 0-.01-.059l-.018-.011a9 9 0 0 1-1.248-.595.05.05 0 0 1-.02-.066l.015-.019q.127-.095.248-.195a.05.05 0 0 1 .051-.007c2.619 1.196 5.454 1.196 8.041 0a.05.05 0 0 1 .053.007q.121.1.248.195a.05.05 0 0 1-.004.085 8 8 0 0 1-1.249.594.05.05 0 0 0-.03.03.05.05 0 0 0 .003.041c.24.465.515.909.817 1.329a.05.05 0 0 0 .056.019 13.2 13.2 0 0 0 4.001-2.02.05.05 0 0 0 .021-.037c.334-3.451-.559-6.449-2.366-9.106a.03.03 0 0 0-.02-.019m-8.198 7.307c-.789 0-1.438-.724-1.438-1.612s.637-1.613 1.438-1.613c.807 0 1.45.73 1.438 1.613 0 .888-.637 1.612-1.438 1.612m5.316 0c-.788 0-1.438-.724-1.438-1.612s.637-1.613 1.438-1.613c.807 0 1.451.73 1.438 1.613 0 .888-.631 1.612-1.438 1.612"></path></svg>';
                    await performDatabaseWriteJob('INSERT INTO links(url, svg_graphic, timestamp) VALUES (?, ?, ?)', [url, svgGraphic, timestamp]);

                    url = 'https://twitter.com/MoarTubes';
                    svgGraphic = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-twitter-x" viewBox="0 0 16 16"><path d="M12.6.75h2.454l-5.36 6.142L16 15.25h-4.937l-3.867-5.07-4.425 5.07H.316l5.733-6.57L0 .75h5.063l3.495 4.633L12.601.75Zm-.86 13.028h1.36L4.323 2.145H2.865l8.875 11.633Z"></path></svg>';
                    await performDatabaseWriteJob('INSERT INTO links(url, svg_graphic, timestamp) VALUES (?, ?, ?)', [url, svgGraphic, timestamp]);

                    url = 'https://www.patreon.com/MoarTube';
                    svgGraphic = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 256 247"><path fill="currentColor" d="M45.136 0v246.35H0V0zm118.521 0C214.657 0 256 41.343 256 92.343s-41.343 92.343-92.343 92.343s-92.343-41.344-92.343-92.343c0-51 41.344-92.343 92.343-92.343"></path></svg>';
                    await performDatabaseWriteJob('INSERT INTO links(url, svg_graphic, timestamp) VALUES (?, ?, ?)', [url, svgGraphic, timestamp]);
                }

                logDebugMessageToConsole('provisioned SQLite3 database', null, null);

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
Rebuilds the database file, reclaiming free space and defragmenting it. 
This can sometimes repair minor corruption issues.
*/
function vacuumDatabase() {
    return new Promise(function(resolve, reject) {
        logDebugMessageToConsole('vacuuming database', null, null);

        database.run('VACUUM', function(error) {
            if(error) {
                logDebugMessageToConsole(null, error, new Error().stack);

                reject();
            }
            else {
                logDebugMessageToConsole('database vacuumed', null, null);

                resolve();
            }
        });
    });
}

/* 
calling this function without synchronization risks throwing an SQLite lock exception
*/
function performDatabaseWriteJob(query, parameters) {
    return new Promise(function(resolve, reject) {
        database.run(query, parameters, function(error) {
            if(error) {
                logDebugMessageToConsole(null, error, new Error().stack);

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
                logDebugMessageToConsole(null, error, new Error().stack);

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
                logDebugMessageToConsole(null, error, new Error().stack);

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
                    logDebugMessageToConsole(null, error, new Error().stack);
                    
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