const express = require('express');

const {  } = require('../controllers/reports-archive');

const router = express.Router();

router.get('/reports/archive/videos', async (req, res) => {
    
});

router.delete('/reports/archive/videos/:archiveId/delete', async (req, res) => {
    
});

router.get('/reports/archive/comments', async (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            database.all('SELECT * FROM commentReportsArchive ORDER BY archive_id DESC', function(error, reports) {
                if(error) {
                    logDebugMessageToConsole(null, error, new Error().stack, true);
                    
                    res.send({isError: true, message: 'error communicating with the MoarTube node'});
                }
                else {
                    res.send({isError: false, reports: reports});
                }
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
});

router.delete('/reports/archive/comments/:archiveId/delete', async (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const archiveId = req.params.archiveId;
            
            if(isArchiveIdValid(archiveId)) {
                submitDatabaseWriteJob('DELETE FROM commentReportsArchive WHERE archive_id = ?', [archiveId], function(isError) {
                    if(isError) {
                        res.send({isError: true, message: 'error communicating with the MoarTube node'});
                    }
                    else {
                        res.send({isError: false});
                    }
                });
            }
            else {
                logDebugMessageToConsole('invalid archive id: ' + archiveId, null, new Error().stack, true);
                
                res.send({isError: true, message: 'error communicating with the MoarTube node'});
            }
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
});

module.exports = router;