const express = require('express');

const { reportsArchiveVideos_GET, reportsArchiveVideosArchiveIdDelete_DELETE } = require('../controllers/reports-archive-videos');
const { logDebugMessageToConsole } = require('../utils/logger');
const { performAuthenticationCheck } = require('../middleware/authentication');

const router = express.Router();

router.get('/', performAuthenticationCheck(true), async (req, res) => {
    try {
        const data = await reportsArchiveVideos_GET();

        res.send(data);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

router.delete('/:archiveId/delete', performAuthenticationCheck(true), async (req, res) => {
    try {
        const archiveId = req.params.archiveId;

        const data = await reportsArchiveVideosArchiveIdDelete_DELETE(archiveId);

        res.send(data);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

module.exports = router;