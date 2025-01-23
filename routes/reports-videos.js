const express = require('express');

const { reportsVideos_GET, reportsVideosArchive_POST, reportsVideosReportIdDelete_DELETE } = require('../controllers/reports-videos');
const { logDebugMessageToConsole } = require('../utils/logger');
const { performAuthenticationCheck } = require('../middleware/authentication');

const router = express.Router();

router.get('/', performAuthenticationCheck(true), async (req, res) => {
    try {
        const data = await reportsVideos_GET();

        res.send(data);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

router.post('/archive', performAuthenticationCheck(true), async (req, res) => {
    try {
        const reportId = req.body.reportId;

        const data = await reportsVideosArchive_POST(reportId);

        res.send(data);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

router.delete('/:reportId/delete', performAuthenticationCheck(true), async (req, res) => {
    try {
        const reportId = req.params.reportId;

        const data = await reportsVideosReportIdDelete_DELETE(reportId);

        res.send(data);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

module.exports = router;