const { logDebugMessageToConsole } = require('../utils/logger');
const { getAuthenticationStatus } = require('../utils/helpers');
const { isReportIdValid } = require('../utils/validators');
const { performDatabaseReadJob_ALL, performDatabaseReadJob_GET, submitDatabaseWriteJob } = require('../utils/database');

function reportsVideos_GET() {
    return new Promise(function(resolve, reject) {
        performDatabaseReadJob_ALL('SELECT * FROM videoReports', [])
        .then(reports => {
            resolve({isError: false, reports: reports});
        })
        .catch(error => {
            reject(error);
        });
    });
}

function reportsVideosArchive_POST(reportId) {
    return new Promise(function(resolve, reject) {
        if(isReportIdValid(reportId)) {
            performDatabaseReadJob_GET('SELECT * FROM videoReports WHERE report_id = ?', [reportId])
            .then(report => {
                if(report != null) {
                    const reportId = report.report_id;
                    const timestamp = report.timestamp;
                    const videoTimestamp = report.video_timestamp;
                    const videoId = report.video_id;
                    const email = report.email;
                    const type = report.type;
                    const message = report.message;
                    
                    submitDatabaseWriteJob('INSERT INTO videoReportsArchive(report_id, timestamp, video_timestamp, video_id, email, type, message) VALUES (?, ?, ?, ?, ?, ?, ?)', [reportId, timestamp, videoTimestamp, videoId, email, type, message], function(isError) {
                        if(isError) {
                            resolve({isError: true, message: 'error communicating with the MoarTube node'});
                        }
                        else {
                            submitDatabaseWriteJob('DELETE FROM videoReports WHERE report_id = ?', [reportId], function(isError) {
                                if(isError) {
                                    resolve({isError: true, message: 'error communicating with the MoarTube node'});
                                }
                                else {
                                    resolve({isError: false});
                                }
                            });
                        }
                    });
                }
                else {
                    logDebugMessageToConsole('report with id does not exist: ' + reportId, null, new Error().stack);
                    
                    resolve({isError: true, message: 'error communicating with the MoarTube node'});
                }
            })
            .catch(error => {
                reject(error);
            });
        }
        else {
            reject(new Error('invalid report id: ' + reportId));
        }
    });
}

function reportsVideosReportIdDelete_DELETE(reportId) {
    return new Promise(function(resolve, reject) {
        if(isReportIdValid(reportId)) {
            submitDatabaseWriteJob('DELETE FROM videoReports WHERE report_id = ?', [reportId], function(isError) {
                if(isError) {
                    resolve({isError: true, message: 'error communicating with the MoarTube node'});
                }
                else {
                    resolve({isError: false});
                }
            });
        }
        else {
            logDebugMessageToConsole('invalid report id: ' + reportId, null, new Error().stack);
            
            resolve({isError: true, message: 'error communicating with the MoarTube node'});
        }
    });
}

module.exports = {
    reportsVideos_GET,
    reportsVideosArchive_POST,
    reportsVideosReportIdDelete_DELETE
}