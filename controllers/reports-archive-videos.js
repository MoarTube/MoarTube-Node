const { isArchiveIdValid } = require('../utils/validators');
const { performDatabaseReadJob_ALL, submitDatabaseWriteJob } = require('../utils/database');

async function reportsArchiveVideos_GET() {
    const reports = await performDatabaseReadJob_ALL('SELECT * FROM videoreportsarchives ORDER BY archive_id DESC', []);

    return { isError: false, reports: reports };
}

async function reportsArchiveVideosArchiveIdDelete_DELETE(archiveId) {
    if (isArchiveIdValid(archiveId)) {
        await submitDatabaseWriteJob('DELETE FROM videoreportsarchives WHERE archive_id = ?', [archiveId]);

        return { isError: false };
    }
    else {
        throw new Error('invalid archive id: ' + archiveId);
    }
}

module.exports = {
    reportsArchiveVideos_GET,
    reportsArchiveVideosArchiveIdDelete_DELETE
}