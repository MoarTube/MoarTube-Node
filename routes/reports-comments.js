const express = require('express');

const {  } = require('../controllers/reports-comments');

const router = express.Router();

router.get('/reports/comments', async (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            database.all('SELECT * FROM commentReports', function(error, reports) {
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
});

router.get('/reports/comments/captcha', async (req, res) => {
    
});

router.post('/reports/comments/archive', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const reportId = req.body.reportId;
            
            if(isReportIdValid(reportId)) {
                database.get('SELECT * FROM commentReports WHERE report_id = ?', [reportId], function(error, report) {
                    if(error) {
                        logDebugMessageToConsole(null, error, new Error().stack, true);
                        
                        res.send({isError: true, message: 'error communicating with the MoarTube node'});
                    }
                    else {
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
                                    res.send({isError: true, message: 'error communicating with the MoarTube node'});
                                }
                                else {
                                    submitDatabaseWriteJob('DELETE FROM commentReports WHERE report_id = ?', [reportId], function(isError) {
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
});

router.delete('/reports/comments/:reportId/delete', async (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const reportId = req.params.reportId;
            
            if(isReportIdValid(reportId)) {
                submitDatabaseWriteJob('DELETE FROM commentReports WHERE report_id = ?', [reportId], function(isError) {
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
});

module.exports = router;