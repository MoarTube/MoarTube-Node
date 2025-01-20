const { performDatabaseReadJob_GET } = require('../utils/database');

async function reportsCount_GET() {
    const videoCountResult = await performDatabaseReadJob_GET('SELECT COUNT(*) AS "reportCount" FROM videoreports', []);
    
    const commentCountResult = await performDatabaseReadJob_GET('SELECT COUNT(*) AS "reportCount" FROM commentreports', []);

    const videoReportCount = videoCountResult.reportCount;
    const commentReportCount = commentCountResult.reportCount;
    const totalReportCount = videoReportCount + commentReportCount;
    
    return {isError: false, videoReportCount: videoReportCount, commentReportCount: commentReportCount, totalReportCount: totalReportCount};
}

module.exports = {
    reportsCount_GET
}