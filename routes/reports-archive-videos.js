const express = require('express');

const { reportsArchiveVideos_GET, reportsArchiveVideosArchiveIdDelete_DELETE } = require('../controllers/reports-archive-videos');
const { logDebugMessageToConsole } = require('../utils/logger');
const { getAuthenticationStatus } = require('../utils/helpers');

const router = express.Router();

router.get('/', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            try {
                const data = await reportsArchiveVideos_GET();

                res.send(data);
            }
            catch(error) {
                logDebugMessageToConsole(null, error, new Error().stack, true);
            
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

router.delete('/:archiveId/delete', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            try {
                const archiveId = req.params.archiveId;

                const data = await reportsArchiveVideosArchiveIdDelete_DELETE(archiveId);

                res.send(data);
            }
            catch(error) {
                logDebugMessageToConsole(null, error, new Error().stack, true);

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