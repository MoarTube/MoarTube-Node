const { logDebugMessageToConsole } = require('../utils/logger');
const { getAuthenticationStatus } = require('../utils/helpers');
const { performDatabaseReadJob_GET } = require('../utils/database');

function reportsCount_GET(req, res) {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            performDatabaseReadJob_GET('SELECT COUNT(*) AS reportCount FROM videoReports', [])
            .then(videoCountResult => {
                performDatabaseReadJob_GET('SELECT COUNT(*) AS reportCount FROM commentReports', [])
                .then(commentCountResult => {
                    const videoReportCount = videoCountResult.reportCount;
                    const commentReportCount = commentCountResult.reportCount;
                    const totalReportCount = videoReportCount + commentReportCount;
                    
                    res.send({isError: false, videoReportCount: videoReportCount, commentReportCount: commentReportCount, totalReportCount: totalReportCount});
                })
                .catch(error => {
                    res.send({isError: true, message: 'error communicating with the MoarTube node'});
                });
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

module.exports = {
    reportsCount_GET
}