const { logDebugMessageToConsole, getAuthenticationStatus } = require('../utils/helpers');

function reportsCount_GET(req, res) {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            database.get('SELECT COUNT(*) AS reportCount FROM videoReports', function(error, videoCountResult) {
                database.get('SELECT COUNT(*) AS reportCount FROM commentReports', function(error, commentCountResult) {
                    const videoReportCount = videoCountResult.reportCount;
                    const commentReportCount = commentCountResult.reportCount;
                    const totalReportCount = videoReportCount + commentReportCount;
                    
                    res.send({isError: false, videoReportCount: videoReportCount, commentReportCount: commentReportCount, totalReportCount: totalReportCount});
                });
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