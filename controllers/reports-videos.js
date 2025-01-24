const { 
    isReportIdValid 
} = require('../utils/validators');
const { 
    performDatabaseReadJob_ALL, performDatabaseReadJob_GET, submitDatabaseWriteJob 
} = require('../utils/database');

async function reportsVideos_GET() {
    const reports = await performDatabaseReadJob_ALL('SELECT * FROM videoreports', [])

    return { isError: false, reports: reports };
}

async function reportsVideosArchive_POST(reportId) {
    if (isReportIdValid(reportId)) {
        const report = await performDatabaseReadJob_GET('SELECT * FROM videoreports WHERE report_id = ?', [reportId]);

        if (report != null) {
            const reportId = report.report_id;
            const timestamp = report.timestamp;
            const videoTimestamp = report.video_timestamp;
            const videoId = report.video_id;
            const email = report.email;
            const type = report.type;
            const message = report.message;

            await submitDatabaseWriteJob('INSERT INTO videoreportsarchives(report_id, timestamp, video_timestamp, video_id, email, type, message) VALUES (?, ?, ?, ?, ?, ?, ?)', [reportId, timestamp, videoTimestamp, videoId, email, type, message]);

            await submitDatabaseWriteJob('DELETE FROM videoreports WHERE report_id = ?', [reportId]);

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

async function reportsVideosReportIdDelete_DELETE(reportId) {
    if (isReportIdValid(reportId)) {
        await submitDatabaseWriteJob('DELETE FROM videoreports WHERE report_id = ?', [reportId]);

        return { isError: false };
    }
    else {
        throw new Error('invalid report id: ' + reportId);
    }
}

module.exports = {
    reportsVideos_GET,
    reportsVideosArchive_POST,
    reportsVideosReportIdDelete_DELETE
}