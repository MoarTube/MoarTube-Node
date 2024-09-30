const { logDebugMessageToConsole } = require('../utils/logger');
const { getAuthenticationStatus } = require('../utils/helpers');
const { isReportIdValid } = require('../utils/validators');
const { performDatabaseReadJob_ALL, performDatabaseReadJob_GET, submitDatabaseWriteJob } = require('../utils/database');

function reportsComments_GET() {
    return new Promise(function(resolve, reject) {
        performDatabaseReadJob_ALL('SELECT * FROM commentReports', [])
        .then(rows => {
            resolve({isError: false, reports: rows});
        })
        .catch(error => {
            resolve({isError: true, message: 'error communicating with the MoarTube node'});
        });
    });
}

function reportsCommentsArchive_POST(reportId) {
    return new Promise(function(resolve, reject) {
        if(isReportIdValid(reportId)) {
            performDatabaseReadJob_GET('SELECT * FROM commentReports WHERE report_id = ?', [reportId])
            .then(report => {
                if(report != null) {
                    const reportId = report.report_id;
                    const timestamp = report.timestamp;
                    const commentTimestamp = report.comment_timestamp;
                    const videoId = report.video_id;
                    const commentId = report.comment_id;
                    const email = report.email;
                    const type = report.type;
                    const message = report.message;
                    
                    submitDatabaseWriteJob('INSERT INTO commentReportsArchive(report_id, timestamp, comment_timestamp, video_id, comment_id, email, type, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [reportId, timestamp, commentTimestamp, videoId, commentId, email, type, message], function(isError) {
                        if(isError) {
                            resolve({isError: true, message: 'error communicating with the MoarTube node'});
                        }
                        else {
                            submitDatabaseWriteJob('DELETE FROM commentReports WHERE report_id = ?', [reportId], function(isError) {
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
                    resolve({isError: true, message: 'error communicating with the MoarTube node'});
                }
            })
            .catch(error => {
                resolve({isError: true, message: 'error communicating with the MoarTube node'});
            });
        }
        else {
            logDebugMessageToConsole('invalid report id: ' + reportId, null, new Error().stack, true);
            
            resolve({isError: true, message: 'error communicating with the MoarTube node'});
        }
    });
}

function reportsCommentsReportIdDelete_DELETE(reportId) {
    return new Promise(function(resolve, reject) {
        if(isReportIdValid(reportId)) {
            submitDatabaseWriteJob('DELETE FROM commentReports WHERE report_id = ?', [reportId], function(isError) {
                if(isError) {
                    resolve({isError: true, message: 'error communicating with the MoarTube node'});
                }
                else {
                    resolve({isError: false});
                }
            });
        }
        else {
            logDebugMessageToConsole('invalid report id: ' + reportId, null, new Error().stack, true);
            
            resolve({isError: true, message: 'error communicating with the MoarTube node'});
        }
    });
}

module.exports = {
    reportsComments_GET,
    reportsCommentsArchive_POST,
    reportsCommentsReportIdDelete_DELETE
}