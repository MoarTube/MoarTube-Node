const { logDebugMessageToConsole, getAuthenticationStatus } = require('../utils/helpers');

function reportsVideos_GET(req, res) {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            database.all('SELECT * FROM videoReports', function(error, reports) {
                if(error) {
                    logDebugMessageToConsole(null, error, new Error().stack, true);
                    
                    res.send({isError: true, message: 'error communicating with the MoarTube node'});
                }
                else {
                    res.send({isError: false, reports: reports});
                }
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
                database.get('SELECT * FROM videoReports WHERE report_id = ?', [reportId], function(error, report) {
                    if(error) {
                        logDebugMessageToConsole(null, error, new Error().stack, true);
                        
                        res.send({isError: true, message: 'error communicating with the MoarTube node'});
                    }
                    else {
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

async function reportsVideosCaptcha_GET(req,res) {
    const captcha = await generateCaptcha();
    
    req.session.videoReportCaptcha = captcha.text;
    
    res.setHeader('Content-Type', 'image/png');
    
    res.send(captcha.data);
}

module.exports = {
    reportsVideos_GET,
    reportsVideosArchive_POST,
    reportsVideosReportIdDelete_DELETE,
    reportsVideosCaptcha_GET
}