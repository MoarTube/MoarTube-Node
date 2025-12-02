const { 
    isArchiveIdValid 
} = require('../utils/validators');
const { 
    performDatabaseReadJob_ALL, submitDatabaseWriteJob 
} = require('../utils/database');

async function reportsArchiveComments_GET() {
    const reports = await performDatabaseReadJob_ALL('SELECT * FROM commentreportsarchives ORDER BY archive_id DESC', []);

    return { isError: false, reports: reports };
}

async function reportsArchiveCommentsArchiveIdDelete_DELETE(archiveId) {
    if (isArchiveIdValid(archiveId)) {
        await submitDatabaseWriteJob('DELETE FROM commentreportsarchives WHERE archive_id = ?', [archiveId]);

        return { isError: false };
    }
    else {
        throw new Error('invalid archive id: ' + archiveId);
    }
}

module.exports = {
    reportsArchiveComments_GET,
    reportsArchiveCommentsArchiveIdDelete_DELETE
}