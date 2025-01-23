const { isReportIdValid } = require('../utils/validators');
const { performDatabaseReadJob_ALL, performDatabaseReadJob_GET, submitDatabaseWriteJob } = require('../utils/database');

async function reportsComments_GET() {
    const reports = await performDatabaseReadJob_ALL('SELECT * FROM commentreports', []);

    return { isError: false, reports: reports };
}

async function reportsCommentsArchive_POST(reportId) {
    if (isReportIdValid(reportId)) {
        const report = await performDatabaseReadJob_GET('SELECT * FROM commentreports WHERE report_id = ?', [reportId]);

        if (report != null) {
            const reportId = report.report_id;
            const timestamp = report.timestamp;
            const commentTimestamp = report.comment_timestamp;
            const videoId = report.video_id;
            const commentId = report.comment_id;
            const email = report.email;
            const type = report.type;
            const message = report.message;

            await submitDatabaseWriteJob('INSERT INTO commentreportsarchives(report_id, timestamp, comment_timestamp, video_id, comment_id, email, type, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [reportId, timestamp, commentTimestamp, videoId, commentId, email, type, message]);

            await submitDatabaseWriteJob('DELETE FROM commentreports WHERE report_id = ?', [reportId]);

            return { isError: false };
        }
        else {
            throw new Error('report with id does not exist: ' + reportId);
        }
    }
    else {
        throw new Error('invalid report id: ' + reportId);
    }
}

async function reportsCommentsReportIdDelete_DELETE(reportId) {
    if (isReportIdValid(reportId)) {
        await submitDatabaseWriteJob('DELETE FROM commentreports WHERE report_id = ?', [reportId]);

        return { isError: false };
    }
    else {
        throw new Error('invalid report id: ' + reportId);
    }
}

module.exports = {
    reportsComments_GET,
    reportsCommentsArchive_POST,
    reportsCommentsReportIdDelete_DELETE
}