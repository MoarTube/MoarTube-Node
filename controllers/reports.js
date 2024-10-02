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
                reject(error);
            });
        })
        .catch(error => {
            reject(error);
        });
    });
}

module.exports = {
    reportsCount_GET
}