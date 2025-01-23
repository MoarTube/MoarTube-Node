const express = require('express');

const { reportsArchiveComments_GET, reportsArchiveCommentsArchiveIdDelete_DELETE } = require('../controllers/reports-archive-comments');
const { logDebugMessageToConsole } = require('../utils/logger');
const { performAuthenticationCheck } = require('../middleware/authentication');

const router = express.Router();

router.get('/', performAuthenticationCheck(true), async (req, res) => {
    try {
        const data = await reportsArchiveComments_GET();

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

        const data = await reportsArchiveCommentsArchiveIdDelete_DELETE(archiveId);

        res.send(data);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

module.exports = router;