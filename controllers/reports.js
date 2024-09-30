const { performDatabaseReadJob_GET } = require('../utils/database');

function reportsCount_GET() {
    return new Promise(function(resolve, reject) {
        performDatabaseReadJob_GET('SELECT COUNT(*) AS reportCount FROM videoReports', [])
        .then(videoCountResult => {
            performDatabaseReadJob_GET('SELECT COUNT(*) AS reportCount FROM commentReports', [])
            .then(commentCountResult => {
                const videoReportCount = videoCountResult.reportCount;
                const commentReportCount = commentCountResult.reportCount;
                const totalReportCount = videoReportCount + commentReportCount;
                
                resolve({isError: false, videoReportCount: videoReportCount, commentReportCount: commentReportCount, totalReportCount: totalReportCount});
            })
            .catch(error => {
                resolve({isError: true, message: 'error communicating with the MoarTube node'});
            });
        })
        .catch(error => {
            resolve({isError: true, message: 'error communicating with the MoarTube node'});
        });
    });
}

module.exports = {
    reportsCount_GET
}