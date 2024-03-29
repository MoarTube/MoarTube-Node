const { logDebugMessageToConsole } = require('../utils/logger');
const { getAuthenticationStatus } = require('../utils/helpers');
const { isReportIdValid } = require('../utils/validators');
const { performDatabaseReadJob_ALL, performDatabaseReadJob_GET, submitDatabaseWriteJob } = require('../utils/database');

function reportsVideos_GET(req, res) {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            performDatabaseReadJob_ALL('SELECT * FROM videoReports', [])
            .then(reports => {
                res.send({isError: false, reports: reports});
            })
            .catch(error => {
                res.send({isError: true, message: 'error communicating with the MoarTube node'});
            });
        }
        else {
            logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

            res.send({isError: true, message: 'you are not logged in'});
        }
    })
    .catch(error => {
        logDebugMessageToConsole(null, error, new Error().stack, true);
        
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    });
}

function reportsVideosArchive_POST(req, res) {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const reportId = req.body.reportId;
            
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
                                res.send({isError: true, message: 'error communicating with the MoarTube node'});
                            }
                            else {
                                submitDatabaseWriteJob('DELETE FROM videoReports WHERE report_id = ?', [reportId], function(isError) {
                                    if(isError) {
                                        res.send({isError: true, message: 'error communicating with the MoarTube node'});
                                    }
                                    else {
                                        res.send({isError: false});
                                    }
                                });
                            }
                        });
                    }
                    else {
                        logDebugMessageToConsole('report with id does not exist: ' + reportId, null, new Error().stack, true);
                        
                        res.send({isError: true, message: 'error communicating with the MoarTube node'});
                    }
                })
                .catch(error => {
                    res.send({isError: true, message: 'error communicating with the MoarTube node'});
                });
            }
            else {
                logDebugMessageToConsole('invalid report id: ' + reportId, null, new Error().stack, true);
                
                res.send({isError: true, message: 'error communicating with the MoarTube node'});
            }
        }
        else {
            logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

            res.send({isError: true, message: 'you are not logged in'});
        }
    })
    .catch(error => {
        logDebugMessageToConsole(null, error, new Error().stack, true);
        
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    });
}

function reportsVideosReportIdDelete_DELETE(req, res) {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const reportId = req.params.reportId;
            
            if(isReportIdValid(reportId)) {
                submitDatabaseWriteJob('DELETE FROM videoReports WHERE report_id = ?', [reportId], function(isError) {
                    if(isError) {
                        res.send({isError: true, message: 'error communicating with the MoarTube node'});
                    }
                    else {
                        res.send({isError: false});
                    }
                });
            }
            else {
                logDebugMessageToConsole('invalid report id: ' + reportId, null, new Error().stack, true);
                
                res.send({isError: true, message: 'error communicating with the MoarTube node'});
            }
        }
        else {
            logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

            res.send({isError: true, message: 'you are not logged in'});
        }
    })
    .catch(error => {
        logDebugMessageToConsole(null, error, new Error().stack, true);
        
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    });
}

module.exports = {
    reportsVideos_GET,
    reportsVideosArchive_POST,
    reportsVideosReportIdDelete_DELETE
}