const { logDebugMessageToConsole } = require('../utils/logger');
const { getAuthenticationStatus } = require('../utils/helpers');
const { isArchiveIdValid } = require('../utils/validators');
const { performDatabaseReadJob_ALL, submitDatabaseWriteJob } = require('../utils/database');

function reportsArchiveComments_GET() {
    return new Promise(function(resolve, reject) {
        performDatabaseReadJob_ALL('SELECT * FROM commentReportsArchive ORDER BY archive_id DESC', [])
        .then(reports => {
            resolve({isError: false, reports: reports});
        })
        .catch(error => {
            resolve({isError: true, message: 'error communicating with the MoarTube node'});
        });
    });
}

function reportsArchiveCommentsArchiveIdDelete_DELETE(archiveId) {
    return new Promise(function(resolve, reject) {
        if(isArchiveIdValid(archiveId)) {
            submitDatabaseWriteJob('DELETE FROM commentReportsArchive WHERE archive_id = ?', [archiveId], function(isError) {
                if(isError) {
                    resolve({isError: true, message: 'error communicating with the MoarTube node'});
                }
                else {
                    resolve({isError: false});
                }
            });
        }
        else {
            logDebugMessageToConsole('invalid archive id: ' + archiveId, null, new Error().stack, true);
            
            resolve({isError: true, message: 'error communicating with the MoarTube node'});
        }
    });
}

module.exports = {
    reportsArchiveComments_GET,
    reportsArchiveCommentsArchiveIdDelete_DELETE
}